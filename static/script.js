// Autocomplete search
document.getElementById("search").addEventListener("input", async function() {
  const query = this.value;
  const suggestions = document.getElementById("suggestions");
  suggestions.innerHTML = "";

  if (query.length < 3) return;

  const response = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&origin=*`
  );
  const data = await response.json();

  data.search.forEach(item => {
    const li = document.createElement("li");
    li.className = "list-group-item list-group-item-action";
    li.textContent = `${item.label} (${item.id})`;
    li.onclick = () => {
      document.getElementById("search").value = item.label;
      document.getElementById("search").setAttribute("data-qid", item.id);
      suggestions.innerHTML = "";
    };
    suggestions.appendChild(li);
  });
});

// Validate references
async function validate() {
  const input = document.getElementById("search");
  const qid = input.getAttribute("data-qid");
  const label = input.value;
  const resultDiv = document.getElementById("result");
  const backBtn = document.getElementById("backBtn");

  if (!qid && !label) {
    resultDiv.innerHTML = `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> Please type a label or select an item first.</div>`;
    return;
  }

  // Spinner while checking
  resultDiv.innerHTML = `
    <div class="text-center my-4">
      <div class="spinner-border text-light" role="status"></div>
      <p class="mt-2 text-light">Checking references...</p>
    </div>
  `;
  backBtn.style.display = "none";

  try {
    const response = await fetch("/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qid })
    });
    const data = await response.json();

    if (data.error) {
      resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle"></i> ${data.error}</div>`;
      backBtn.style.display = "block";
      return;
    }
    if (data.message) {
      resultDiv.innerHTML = `<div class="alert alert-info"><i class="bi bi-info-circle"></i> ${data.message}</div>`;
      backBtn.style.display = "block";
      return;
    }

    // Count alive/dead
    const aliveCount = data.filter(r => r.status === "alive").length;
    const deadCount = data.filter(r => r.status === "dead").length;

    let html = `
      <div class="card p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h3 class="mb-0 text-light"><i class="bi bi-list-check"></i> Results for ${qid || label}</h3>
          <div>
            <button class="btn btn-outline-info btn-sm me-2" onclick="resetSearch()">
              🔄 Search Another Item
            </button>
            <a href="https://www.wikidata.org/wiki/${qid}" target="_blank" class="btn btn-outline-warning btn-sm">
              ✏️ Edit Item
            </a>
          </div>
        </div>
        <p><span class="badge bg-success"><i class="bi bi-check-circle"></i> Alive: ${aliveCount}</span>
           <span class="badge bg-danger ms-2"><i class="bi bi-x-octagon"></i> Dead: ${deadCount}</span></p>
        <ul class="list-group mt-3">
    `;

    data.forEach(ref => {
      const badge = ref.status === "alive" ? "success" : "danger";
      const icon = ref.status === "alive" ? "check-circle" : "x-octagon";

      html += `
        <li class="list-group-item d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <a href="${ref.url}" target="_blank" class="text-truncate ref-link">${ref.url}</a>
          <span class="badge bg-${badge} d-flex align-items-center">
            <i class="bi bi-${icon} me-1"></i> ${ref.status}
          </span>
      `;

      if (ref.status === "dead") {
        html += `
          <small class="text-warning mt-1">
            Suggestion: Edit statement <strong>${ref.propertyLabel}</strong>${ref.statementValue ? `: <em>${ref.statementValue}</em>` : ""}
          </small>
        `;
      }

      html += "</li>";
    });

    html += "</ul></div>";
    resultDiv.innerHTML = html;
    backBtn.style.display = "block";

  } catch (err) {
    resultDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-bug"></i> Error: ${err}</div>`;
    backBtn.style.display = "block";
  }
}

// Reset to search again
function resetSearch() {
  document.getElementById("search").value = "";
  document.getElementById("search").removeAttribute("data-qid");
  document.getElementById("result").innerHTML = "";
  document.getElementById("backBtn").style.display = "none";
}
