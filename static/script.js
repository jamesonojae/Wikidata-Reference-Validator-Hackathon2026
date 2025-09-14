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
// Validate references
async function validate() {
  const input = document.getElementById("search");
  const qid = input.getAttribute("data-qid");
  const label = input.value;
  const resultDiv = document.getElementById("result");
  const searchSection = document.getElementById("searchSection"); 

  if (!qid && !label) {
    resultDiv.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle"></i> Please type a label or select an item first.
      </div>`;
    return;
  }

  // Hide search after clicking validate
  searchSection.style.display = "none";

  // Start timer
  let estimate = 30; // optimistic guess (30s)
  let remaining = estimate;
  resultDiv.innerHTML = `
    <div class="d-flex flex-column align-items-center justify-content-center my-5">
      <div class="fancy-loader"></div>
      <p class="mt-3 text-light fw-bold">Checking references...</p>
      <p id="countdownTimer" class="text-info small">Estimated time: ${remaining}s</p>
    </div>
  `;

  const countdownInterval = setInterval(() => {
    remaining--;
    const el = document.getElementById("countdownTimer");
    if (el) {
      if (remaining > 0) {
        el.textContent = `Estimated time: ${remaining}s`;
      } else {
        el.textContent = "Finalizing...";
      }
    }
  }, 1000);

  const start = Date.now();
  try {
    const response = await fetch("/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qid })
    });
    const data = await response.json();

    // Stop countdown when backend finishes
    clearInterval(countdownInterval);

    // Calculate actual duration
    const duration = Math.floor((Date.now() - start) / 1000);

    // Handle error
    if (data.error) {
      resultDiv.innerHTML = `
        <div class="card p-4 text-center">
          <div class="alert alert-danger">
            <i class="bi bi-x-circle"></i> ${data.error}
          </div>
          <p class="small text-muted">Completed in ${duration}s</p>
          <button class="btn btn-lg btn-glass-action mt-3" onclick="resetSearch()">🔄 Search Another Item</button>
        </div>`;
      return;
    }

    // Handle "no references found"
    if (data.message) {
      resultDiv.innerHTML = `
        <div class="card p-4 text-center">
          <div class="alert alert-info">
            <i class="bi bi-info-circle"></i> ${data.message}
          </div>
          <p class="small text-muted">Completed in ${duration}s</p>
          <button class="btn btn-lg btn-glass-action mt-3" onclick="resetSearch()">🔄 Search Another Item</button>
        </div>`;
      return;
    }

    // Count alive/dead
    const aliveCount = data.filter(r => r.status === "alive").length;
    const deadCount = data.filter(r => r.status === "dead").length;

    // Save results for report.html
    localStorage.setItem("reportData", JSON.stringify({
      qid: qid || label,
      aliveCount,
      deadCount,
      references: data,
      duration
    }));

    let html = `
      <div class="card p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="d-flex gap-2">
            <button id="viewReportBtn" class="btn btn-info btn-sm">📊 View Report</button>
            <a href="https://www.wikidata.org/wiki/${qid}" target="_blank" class="btn btn-glass-warning btn-sm">
              ✏️ Edit Item
            </a>
          </div>
          <h3 class="mb-0 text-light">
            <i class="bi bi-list-check"></i> Results for ${qid || label}
          </h3>
        </div>
        <p>
          <span class="badge bg-success"><i class="bi bi-check-circle"></i> Alive: ${aliveCount}</span>
          <span class="badge bg-danger ms-2"><i class="bi bi-x-octagon"></i> Dead: ${deadCount}</span>
        </p>
        <ul class="list-group mt-3">
    `;

    data.forEach((ref, index) => {
      const badge = ref.status === "alive" ? "success" : "danger";
      const icon = ref.status === "alive" ? "check-circle" : "x-octagon";
      const collapseId = `collapseRef${index}`;
      const btnId = `toggleBtn${index}`;

      html += `
        <li class="list-group-item p-3 rounded shadow-sm mb-2">
          <div class="d-flex justify-content-between align-items-center gap-2">
            <a href="${ref.url}" target="_blank" class="ref-link" title="${ref.url}">
              ${ref.url}
            </a>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-${badge} d-flex align-items-center px-2 py-1">
                <i class="bi bi-${icon} me-1"></i> ${ref.status}
              </span>
              <button id="${btnId}" class="btn btn-sm btn-outline-secondary"
                      type="button"
                      data-bs-toggle="collapse"
                      data-bs-target="#${collapseId}"
                      aria-expanded="false"
                      aria-controls="${collapseId}">
                Details
              </button>
            </div>
          </div>

          <div class="collapse mt-2" id="${collapseId}">
            <div class="p-2 border rounded bg-light">
              <div class="fw-bold">Statement:</div>
              <div>
                <strong>${ref.propertyLabel}</strong>
                ${ref.statementValue ? `: <em>${ref.statementValue}</em>` : ""}
              </div>
              ${
                ref.status === "dead"
                  ? `
              <div class="mt-2 alert alert-warning p-2">
                <i class="bi bi-exclamation-triangle me-1"></i>
                <span class="fw-semibold">Suggestion:</span>
                Please review or edit this statement reference.
              </div>`
                  : ""
              }
            </div>
          </div>
        </li>

        <script>
          document.addEventListener("DOMContentLoaded", function() {
            const btn = document.getElementById("${btnId}");
            const collapse = document.getElementById("${collapseId}");
            collapse.addEventListener("shown.bs.collapse", () => {
              btn.textContent = "Hide";
            });
            collapse.addEventListener("hidden.bs.collapse", () => {
              btn.textContent = "Details";
            });
          });
        </script>
      `;
    });

    html += `
        </ul>
        <p class="small text-muted mt-2">Completed in ${duration}s</p>
        <div class="text-center mt-3">
          <button class="btn btn-lg btn-glass-action" onclick="resetSearch()">🔄 Search Another Item</button>
        </div>
      </div>
    `;

    resultDiv.innerHTML = html;

    // Attach event after HTML is injected
    document.getElementById("viewReportBtn").onclick = () => {
      window.open("/report", "_blank");
    };

  } catch (err) {
    clearInterval(countdownInterval);
    resultDiv.innerHTML = `
      <div class="card p-4 text-center">
        <div class="alert alert-danger">
          <i class="bi bi-bug"></i> Error: ${err}
        </div>
        <button class="btn btn-lg btn-glass-action mt-3" onclick="resetSearch()">🔄 Search Another Item</button>
      </div>`;
  }
}



// Reset to search again
function resetSearch() {
  const searchSection = document.getElementById("searchSection");
  document.getElementById("search").value = "";
  document.getElementById("search").removeAttribute("data-qid");
  document.getElementById("result").innerHTML = "";

  // Show search again
  searchSection.style.display = "block";
}
