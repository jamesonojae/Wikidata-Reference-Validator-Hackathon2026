
from flask import Flask, request, jsonify, render_template
import requests
import aiohttp
import asyncio

app = Flask(__name__)

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/115.0.0.0 Safari/537.36"
}


@app.route("/")
def home():
    return render_template("index.html")


async def check_url(session, url):
    """Check if a reference URL is alive or dead asynchronously with HEAD then GET fallback."""
    try:
        async with session.head(url, allow_redirects=True, timeout=5) as resp:
            # Treat 2xx, 3xx, 401, 403 as alive
            if resp.status < 400 or resp.status in (401, 403):
                return {"url": url, "status": "alive"}
    except Exception:
        pass  # HEAD failed, try GET

    try:
        async with session.get(url, allow_redirects=True, timeout=10) as resp:
            if resp.status < 400 or resp.status in (401, 403):
                return {"url": url, "status": "alive"}
            else:
                return {"url": url, "status": "dead"}
    except Exception:
        return {"url": url, "status": "dead"}


def fetch_labels(ids):
    """
    Given a list of Wikidata IDs (e.g., P19, Q149573),
    fetch their English labels from Wikidata.
    Returns a dict {id: label}.
    """
    if not ids:
        return {}

    params = {
        "action": "wbgetentities",
        "ids": "|".join(ids),
        "format": "json",
        "props": "labels",
        "languages": "en"
    }
    r = requests.get(WIKIDATA_API, params=params, headers=HEADERS, timeout=10)
    r.raise_for_status()
    entities = r.json().get("entities", {})

    labels = {}
    for eid, data in entities.items():
        label = data.get("labels", {}).get("en", {}).get("value", eid)
        labels[eid] = label
    return labels


@app.route("/validate", methods=["POST"])
def validate_references():
    data = request.get_json(force=True)
    if not data or "qid" not in data:
        return jsonify({"error": "Missing QID"}), 400

    qid = data["qid"].strip()

    try:
        # Fetch entity data from Wikidata API
        params = {
            "action": "wbgetentities",
            "ids": qid,
            "format": "json"
        }
        r = requests.get(WIKIDATA_API, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        entity = r.json()["entities"].get(qid, {})
        claims = entity.get("claims", {})

        refs_data = []  # To hold refs with URL + prop + value
        all_ids_to_label = set()  # collect all property and statement QIDs for labels

        for prop, statements in claims.items():
            for stmt in statements:
                statement_value = None
                mainsnak = stmt.get("mainsnak", {})
                datavalue = mainsnak.get("datavalue", {}).get("value")
                if isinstance(datavalue, dict) and "id" in datavalue:
                    statement_value = datavalue["id"]

                for ref in stmt.get("references", []):
                    for snaks in ref.get("snaks", {}).values():
                        for snak in snaks:
                            datavalue = snak.get("datavalue", {}).get("value")
                            ref_url = None

                            if isinstance(datavalue, dict) and "uri" in datavalue:
                                ref_url = datavalue["uri"]
                            elif isinstance(datavalue, str) and datavalue.startswith("http"):
                                ref_url = datavalue

                            if ref_url:
                                refs_data.append({
                                    "url": ref_url,
                                    "property": prop,
                                    "statementValue": statement_value
                                })
                                all_ids_to_label.add(prop)
                                if statement_value:
                                    all_ids_to_label.add(statement_value)

        if not refs_data:
            return jsonify({"message": "No references found"}), 200

        # Run async URL checks in parallel
        async def run_checks():
            async with aiohttp.ClientSession(headers=HEADERS) as session:
                tasks = [check_url(session, ref["url"]) for ref in refs_data]
                return await asyncio.gather(*tasks)

        url_statuses = asyncio.run(run_checks())

        # Fetch labels for all property and statement IDs
        labels = fetch_labels(all_ids_to_label)

        # Combine results, add labels and status
        results = []
        for ref_data, status_data in zip(refs_data, url_statuses):
            results.append({
                "url": ref_data["url"],
                "status": status_data["status"],
                "propertyLabel": labels.get(ref_data["property"], ref_data["property"]),
                "statementValue": labels.get(ref_data["statementValue"], ref_data["statementValue"]) if ref_data["statementValue"] else ""
            })
=======
from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

WIKIDATA_API = "https://www.wikidata.org/wiki/Special:EntityData/{}.json"

# Add headers to avoid API rejections
REQUEST_HEADERS = {
    "User-Agent": "WikidataReferenceValidator/1.0 (https://meta.wikimedia.org/wiki/User:JosefAnthony)"
}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/validate", methods=["POST"])
def validate():
    qid = request.json.get("qid")
    if not qid:
        return jsonify({"error": "No QID provided"}), 400

    try:
        # Fetch entity data from Wikidata
        url = WIKIDATA_API.format(qid)
        response = requests.get(url, headers=REQUEST_HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()

        entity = data.get("entities", {}).get(qid, {})
        if not entity:
            return jsonify({"error": "Entity not found"}), 404

        claims = entity.get("claims", {})
        references = []

        # Extract reference URLs
        for prop, claim_list in claims.items():
            for claim in claim_list:
                if "references" in claim:
                    for ref in claim["references"]:
                        for snak in ref.get("snaks", {}).values():
                            for s in snak:
                                ref_value = s.get("datavalue", {}).get("value")
                                if isinstance(ref_value, str) and ref_value.startswith("http"):
                                    references.append(ref_value)
                                elif isinstance(ref_value, dict) and "id" in ref_value:
                                    continue

        # Remove duplicates
        references = list(set(references))

        if not references:
            return jsonify({"message": "No reference URLs found for this entity."})

        # Check if URLs are alive
        results = []
        for ref in references:
            status = "dead"
            try:
                r = requests.head(ref, headers=REQUEST_HEADERS, allow_redirects=True, timeout=5)
                if r.status_code < 400:
                    status = "alive"
                else:
                    # fallback to GET
                    r = requests.get(ref, headers=REQUEST_HEADERS, stream=True, timeout=5)
                    if r.status_code < 400:
                        status = "alive"
            except:
                pass
            results.append({"url": ref, "status": status})

        return jsonify(results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
