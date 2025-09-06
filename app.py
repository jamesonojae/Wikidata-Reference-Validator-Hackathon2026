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
