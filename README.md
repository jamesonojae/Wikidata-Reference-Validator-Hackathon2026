#  Wikidata Reference Validator

This tool checks the external reference URLs on a Wikidata item (QID) to determine if they're still alive or dead — helping maintain the integrity and quality of Wikidata statements.

---

##  What it does

-  Autocompletes and selects Wikidata items
-  Extracts all reference URLs from the item's statements
-  Checks if the referenced URLs are reachable (alive or dead)
-  Flags dead links and suggests which statement they belong to
-  Provides a one-click "Edit" button to fix or update the reference

---

##  Live Demo

Coming soon — or run locally (instructions below).

---


##  Tech Stack

- Python 3.10+
- Flask (Backend)
- Aiohttp + Asyncio for fast URL checking
- HTML, CSS, Vanilla JS (Frontend)
- Wikidata API (no authentication required)

---

##  How to Run Locally

### 1. Clone the repository

```bash
git clone https://gitlab.com/Josefanthony/wikidata-reference-validator.git
cd wikidata-reference-validator

2. Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

3. Install dependencies
pip install -r requirements.txt


Or manually:

pip install flask aiohttp requests

4. Run the app
python app.py
```

Open http://127.0.0.1:5000 in your browser.

