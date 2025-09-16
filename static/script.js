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
console.log("Validation response:", data);

  data.search.forEach(item => {
    const li = document.createElement("li");
    li.className = "list-group-item list-group-item-action";

    // ✅ show label + description (like Wikidata search)
    li.innerHTML = `
      <div>
        <strong>${item.label}</strong>
        <div class="small text-muted">${item.description || ""}</div>
      </div>
    `;

    li.onclick = () => {
      document.getElementById("search").value = item.label;
      document.getElementById("search").setAttribute("data-qid", item.id);
      document.getElementById("search").setAttribute("data-label", item.label); // ✅ store label
      suggestions.innerHTML = "";
    };

    suggestions.appendChild(li);
  });
});

// Cache property labels to avoid repeated API calls
const propertyLabelCache = {};

async function getPropertyLabel(pid) {
  if (!pid) return "";
  if (propertyLabelCache[pid]) return propertyLabelCache[pid];

  try {
    const response = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${pid}&format=json&languages=en&origin=*`
    );
    const data = await response.json();
    const label = data.entities[pid]?.labels?.en?.value || "";
    console.log('label', label);
    
    propertyLabelCache[pid] = label;
    return label;
  } catch {
    return "";
  }
}

// Validate references
// Validate references
async function validate() {
  const input = document.getElementById("search");
  const qid = input.getAttribute("data-qid");
  const label = input.getAttribute("data-label") || input.value;  // ✅ prefer stored label
  const resultDiv = document.getElementById("result");
  const searchSection = document.getElementById("searchSection"); 

  if (!qid && !label) {
    resultDiv.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle"></i> Please type a label or select an item first.
      </div>`;
    return;
  }

  searchSection.style.display = "none"; // hide search

  // Loader UI
  let estimate = 30;
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

    clearInterval(countdownInterval);
    const duration = Math.floor((Date.now() - start) / 1000);

    // Error
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

    // No refs
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

    // Alive/dead counts
    const aliveCount = data.filter(r => r.status === "alive").length;
    const deadCount = data.filter(r => r.status === "dead").length;

    localStorage.setItem("reportData", JSON.stringify({
      qid: qid || label,
      label,
      aliveCount,
      deadCount,
      references: data,
      duration
    }));

    // Build result HTML
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
             <i class="bi bi-list-check"></i> Results for ${label} (${qid})
          </h3>
        </div>
        <p>
          <span class="badge bg-success"><i class="bi bi-check-circle"></i> Alive: ${aliveCount}</span>
          <span class="badge bg-danger ms-2"><i class="bi bi-x-octagon"></i> Dead: ${deadCount}</span>
        </p>
        <ul class="list-group mt-3">
    `;

    for (let i = 0; i < data.length; i++) {
      const ref = data[i];
      const badge = ref.status === "alive" ? "success" : "danger";
      const icon = ref.status === "alive" ? "check-circle" : "x-octagon";
      const collapseId = `collapseRef${i}`;
      const btnId = `toggleBtn${i}`;
      // console.log('reffffffff', ref);
      
      // ✅ Always fetch property label instead of showing Pid
      const propertyLabel = ref.propertyLabel;
      // console.log('propertyLabel', propertyLabel);
      
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
                      aria-controls="${collapseId}">Details</button>
            </div>
          </div>

          <div class="collapse mt-2" id="${collapseId}">
            <div class="p-2 border rounded bg-light">
              <div class="fw-bold">Statement:</div>
             <div>
                <strong>${propertyLabel}</strong>
                ${ref.statementValue ? `: <em>${ref.statementValue}</em>` : ""}
              </div>
              ${
                ref.status === "dead"
                  ? `<div class="mt-2 alert alert-warning p-2">
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
    }

    html += `
        </ul>
        <p class="small text-muted mt-2">Completed in ${duration}s</p>
        <div class="text-center mt-3">
          <button class="btn btn-lg btn-glass-action" onclick="resetSearch()">🔄 Search Another Item</button>
        </div>
      </div>
    `;

    resultDiv.innerHTML = html;

    // Open report
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
  document.getElementById("search").removeAttribute("data-label"); // ✅ clear stored label
  document.getElementById("result").innerHTML = "";

  // Show search again
  searchSection.style.display = "block";
}
