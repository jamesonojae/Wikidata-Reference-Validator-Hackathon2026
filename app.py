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

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/report")
def report():
    return render_template("report.html")

@app.route("/search")
def search():
    query = request.args.get("q")
    if not query:
        return jsonify([])

    params = {
        "action": "wbsearchentities",
        "search": query,
        "language": "en",
        "format": "json"
    }
    r = requests.get(WIKIDATA_API, params=params)
    data = r.json()

    results = []
    for item in data.get("search", []):
        results.append({
            "id": item.get("id"),
            "label": item.get("label"),
            "description": item.get("description", "")
        })

    return jsonify(results)


async def check_url(session, url):
    """Check if a reference URL is alive or dead asynchronously with HEAD then GET fallback."""
    try:
        async with session.head(url, allow_redirects=True, timeout=5) as resp:
            if resp.status < 400 or resp.status in (401, 403):
                return {"url": url, "status": "alive"}
    except Exception:
        pass

    try:
        async with session.get(url, allow_redirects=True, timeout=10) as resp:
            if resp.status < 400 or resp.status in (401, 403):
                return {"url": url, "status": "alive"}
            else:
                return {"url": url, "status": "dead"}
    except Exception:
        return {"url": url, "status": "dead"}


def fetch_labels(ids):
    """Fetch English labels for a set of Wikidata IDs in batches."""
    labels = {}
    if not ids:
        return labels

    id_list = list(ids)
    chunks = [id_list[i:i + 50] for i in range(0, len(id_list), 50)]

    for chunk in chunks:
        params = {
            "action": "wbgetentities",
            "ids": "|".join(chunk),
            "format": "json",
            "props": "labels",
            "languages": "en"
        }
        try:
            r = requests.get(WIKIDATA_API, params=params, headers=HEADERS, timeout=10)
            r.raise_for_status()
            entities = r.json().get("entities", {})
            for eid, data in entities.items():
                label = data.get("labels", {}).get("en", {}).get("value")
                if label:
                    labels[eid] = label
        except Exception as e:
            print(f"Label fetch failed for chunk {chunk}: {e}")
    return labels


@app.route("/validate", methods=["POST"])
def validate_references():
    data = request.get_json(force=True)
    if not data or "qid" not in data:
        return jsonify({"error": "Missing QID"}), 400

    qid = data["qid"].strip()

    try:
        params = {
            "action": "wbgetentities",
            "ids": qid,
            "format": "json"
        }
        r = requests.get(WIKIDATA_API, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        entity = r.json()["entities"].get(qid, {})
        claims = entity.get("claims", {})

        refs_data = []
        all_ids_to_label = set()

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
                                if statement_value and statement_value.startswith("Q"):
                                    all_ids_to_label.add(statement_value)

        if not refs_data:
            return jsonify({"message": "No references found"}), 200

        async def run_checks():
            async with aiohttp.ClientSession(headers=HEADERS) as session:
                tasks = [check_url(session, ref["url"]) for ref in refs_data]
                return await asyncio.gather(*tasks)

        url_statuses = asyncio.run(run_checks())
        labels = fetch_labels(all_ids_to_label)

        results = []
        for ref_data, status_data in zip(refs_data, url_statuses):
            results.append({
                "url": ref_data["url"],
                "status": status_data["status"],
                "propertyLabel": labels.get(ref_data["property"], ref_data["property"]),
                "statementValue": labels.get(ref_data["statementValue"], ref_data["statementValue"]) if ref_data["statementValue"] else ""
            })

        return jsonify(results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
