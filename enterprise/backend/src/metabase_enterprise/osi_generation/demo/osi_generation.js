const apiBase = "/api/ee/osi-generation-demo";

const state = {
  entities: [],
  indexEntries: [],
  indexBusy: false,
  runs: [],
  selected: null,
  status: null,
};

const refreshRevisions = {
  entities: 0,
  index: 0,
  runs: 0,
  status: 0,
};

const renderedSnapshots = {
  entities: null,
  index: null,
  runs: null,
};

let queuedRunWatch = null;
const runIdsAwaitingEnd = new Set();

const els = {
  appdbSearchResults: document.querySelector("#appdb-search-results"),
  appdbSearchSummary: document.querySelector("#appdb-search-summary"),
  comparisonSearch: document.querySelector("#comparison-search"),
  contextJson: document.querySelector("#context-json"),
  counts: document.querySelector("#counts"),
  clearIndex: document.querySelector("#clear-index"),
  deleteContexts: document.querySelector("#delete-contexts"),
  deleteRuns: document.querySelector("#delete-runs"),
  editor: document.querySelector("#editor"),
  editorKind: document.querySelector("#editor-kind"),
  editorMeta: document.querySelector("#editor-meta"),
  editorTitle: document.querySelector("#editor-title"),
  enabledToggle: document.querySelector("#enabled-toggle"),
  ensureJob: document.querySelector("#ensure-job"),
  entityList: document.querySelector("#entity-list"),
  indexStepCopy: document.querySelector("#index-step-copy"),
  indexList: document.querySelector("#index-list"),
  indexSummary: document.querySelector("#index-summary"),
  librarySearchResults: document.querySelector("#library-search-results"),
  librarySearchSummary: document.querySelector("#library-search-summary"),
  pipeline: document.querySelector("#pipeline"),
  promptDisclosure: document.querySelector("#prompt-disclosure"),
  promptSystem: document.querySelector("#prompt-system"),
  promptUser: document.querySelector("#prompt-user"),
  promptVersion: document.querySelector("#prompt-version"),
  reconcile: document.querySelector("#reconcile"),
  refreshAll: document.querySelector("#refresh-all"),
  requestRewrite: document.querySelector("#request-rewrite"),
  runDetails: document.querySelector("#run-details"),
  runList: document.querySelector("#run-list"),
  runGeneration: document.querySelector("#run-generation"),
  save: document.querySelector("#save"),
  saveDescription: document.querySelector("#save-description"),
  search: document.querySelector("#search"),
  semanticSearchResults: document.querySelector("#semantic-search-results"),
  semanticSearchSummary: document.querySelector("#semantic-search-summary"),
  sourceDescription: document.querySelector("#source-description"),
  statusFilter: document.querySelector("#status-filter"),
  statusNote: document.querySelector("#status-note"),
  toast: document.querySelector("#toast"),
  typeFilter: document.querySelector("#type-filter"),
  validation: document.querySelector("#validation"),
  vectorTooltip: document.querySelector("#vector-tooltip"),
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (_error) { body = text; }
  }
  if (!response.ok) {
    const message = body?.message || body?.error || body || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return body;
}

function invalidateRefreshes(...resources) {
  resources.forEach((resource) => { refreshRevisions[resource] += 1; });
  if (resources.includes("runs")) window.clearTimeout(refreshRuns.timer);
  if (resources.includes("index")) window.clearTimeout(refreshIndexEntries.timer);
}

async function latestRefresh(resource, load, commit) {
  const revision = ++refreshRevisions[resource];
  try {
    const result = await load();
    if (revision !== refreshRevisions[resource]) return false;
    commit(result);
    return true;
  } catch (error) {
    if (revision !== refreshRevisions[resource]) return false;
    throw error;
  }
}

async function mutate(resources, path, options) {
  invalidateRefreshes(...resources);
  try {
    return await request(path, options);
  } finally {
    // A refresh may have started while the write was in flight. Invalidate it before loading committed state.
    invalidateRefreshes(...resources);
  }
}

function updateRenderedCollection(resource, data, render) {
  const snapshot = JSON.stringify(data);
  if (snapshot === renderedSnapshots[resource]) return;
  renderedSnapshots[resource] = snapshot;
  render(data);
}

function showToast(message, error = false) {
  els.toast.textContent = message;
  els.toast.className = `toast show${error ? " error" : ""}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { els.toast.className = "toast"; }, 3200);
}

function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

function after(left, right) {
  return Boolean(left && (!right || new Date(left) > new Date(right)));
}

function entityStatus(entity) {
  if (entity.generation_state) return entity.generation_state.replaceAll("_", "-");
  const context = entity.context;
  if (!context) return "missing";
  if (after(context.rewrite_requested_at, context.generated_at)) return "rewrite-requested";
  if (context.data_source === "human") return "approved";
  return "generated";
}

function statusLabel(status) {
  return {
    approved: "Approved",
    "approved-invalidated": "Approved · source changed",
    generated: "Generated",
    invalidated: "Source changed",
    missing: "Missing",
    "rewrite-requested": "Rewrite requested",
  }[status];
}

function entityTypeIcon(entityType) {
  const paths = {
    metric: '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.562 5.499 12.25 3.81v8.439H3.81L5.5 10.562l.915.915 1.063-1.063-.915-.915.937-.937.915.915 1.063-1.063-.915-.915.937-.937.915.915 1.063-1.063-.915-.915Zm3.188-2.775c0-.935-1.131-1.404-1.793-.742l-9.975 9.976c-.662.661-.193 1.792.742 1.792H13.75V2.724Z"/>',
    model: '<path d="M8.5 1.423a1 1 0 0 0-1 0L2.554 4.278a1 1 0 0 0-.5.866v5.712a1 1 0 0 0 .5.866L7.5 14.577a1 1 0 0 0 1 0l4.946-2.855a1 1 0 0 0 .5-.866V5.144a1 1 0 0 0-.5-.866L8.5 1.423zM3.554 6.207v4.36l3.696 2.134V8.425L3.554 6.207zM8.75 12.7l3.696-2.134v-4.36L8.75 8.425V12.7zm2.868-7.746L8 2.866 4.382 4.955 8 7.125l3.618-2.17z"/>',
    segment: '<path d="M10.3573 7.52888C10.2323 7.6539 10.1621 7.82344 10.1621 8.00021C10.1621 8.17699 10.2323 8.34653 10.3573 8.47155L11.9413 10.0562C12.0663 10.1812 12.2359 10.2514 12.4126 10.2514C12.5894 10.2514 12.7589 10.1812 12.884 10.0562L14.4686 8.47155C14.5936 8.34653 14.6638 8.17699 14.6638 8.00021C14.6638 7.82344 14.5936 7.6539 14.4686 7.52888L12.884 5.94421C12.7589 5.81923 12.5894 5.74902 12.4126 5.74902C12.2359 5.74902 12.0663 5.81923 11.9413 5.94421L10.3573 7.52888ZM1.53113 7.52888C1.40615 7.6539 1.33594 7.82344 1.33594 8.00021C1.33594 8.17699 1.40615 8.34653 1.53113 8.47155L3.1158 10.0562C3.24081 10.1812 3.41035 10.2514 3.58713 10.2514C3.7639 10.2514 3.93344 10.1812 4.05846 10.0562L5.64313 8.47155C5.76811 8.34653 5.83832 8.17699 5.83832 8.00021C5.83832 7.82344 5.76811 7.6539 5.64313 7.52888L4.05846 5.94421C3.93344 5.81923 3.7639 5.74902 3.58713 5.74902C3.41035 5.74902 3.24081 5.81923 3.1158 5.94421L1.53113 7.52888ZM5.94357 11.9413C5.81859 12.0663 5.74805 12.2362 5.74805 12.413C5.74805 12.5897 5.81859 12.7596 5.94357 12.8846L7.52824 14.4686C7.65326 14.5936 7.8228 14.6638 7.99957 14.6638C8.17635 14.6638 8.34589 14.5936 8.4709 14.4686L10.0556 12.8846C10.1806 12.7596 10.2511 12.5897 10.2511 12.413C10.2511 12.2362 10.1806 12.0663 10.0556 11.9413L8.4709 10.3573C8.34589 10.2323 8.17635 10.1621 7.99957 10.1621C7.8228 10.1621 7.65326 10.2323 7.52824 10.3573L5.94357 11.9413ZM5.94421 3.1158C5.81923 3.24081 5.74902 3.41035 5.74902 3.58713C5.74902 3.7639 5.81923 3.93344 5.94421 4.05846L7.52888 5.64246C7.6539 5.76744 7.82344 5.83765 8.00021 5.83765C8.17699 5.83765 8.34653 5.76744 8.47155 5.64246L10.0562 4.05846C10.1812 3.93344 10.2514 3.7639 10.2514 3.58713C10.2514 3.41035 10.1812 3.24081 10.0562 3.1158L8.47155 1.53113C8.34653 1.40615 8.17699 1.33594 8.00021 1.33594C7.82344 1.33594 7.6539 1.40615 7.52888 1.53113L5.94421 3.1158Z" fill="none" stroke="currentColor" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round"/>',
    table: '<path d="M12.667 1.25c1.15 0 2.083.933 2.083 2.083v9.334c0 1.15-.933 2.083-2.083 2.083H3.333a2.083 2.083 0 0 1-2.083-2.083V3.333c0-1.15.933-2.083 2.083-2.083h9.334zm-9.917 9.5v1.917c0 .322.261.583.583.583H7.25v-2.5h-4.5zm6 0v2.5h3.917a.583.583 0 0 0 .583-.583V10.75h-4.5zm-6-1.5h4.5v-2.5h-4.5v2.5zm6 0h4.5v-2.5h-4.5v2.5zm-5.417-6.5a.583.583 0 0 0-.583.583V5.25h4.5v-2.5H3.333zm5.417 2.5h4.5V3.333a.583.583 0 0 0-.583-.583H8.75v2.5z"/>',
  };
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${paths[entityType] || paths.table}</svg>`;
}

function renderStatus() {
  const status = state.status;
  const schedulerReady = status.scheduler.started && !status.scheduler.standby && !status.scheduler.shutdown;
  const missingIndexDependencies = Object.entries(status.index?.dependencies || {})
    .filter(([_key, ready]) => !ready)
    .map(([key]) => key);
  const gates = [
    ["License", status.available, status.available ? "Available" : "Unavailable"],
    ["LLM", status.configured, status.model || "Not configured"],
    ["Scheduler", schedulerReady, status.scheduler.disabled ? "Disabled by environment" : (schedulerReady ? "Running" : "Not running")],
    ["Job", status.job.registered, status.job.registered ? "Registered" : "Not registered"],
    ["Generation", status.enabled, status.enabled ? "Enabled" : "Disabled"],
  ];

  els.pipeline.innerHTML = gates.map(([label, ok, value]) => `
    <div class="gate ${ok ? "ok" : "bad"}">
      <div class="gate-node">${ok ? "✓" : "!"}</div>
      <div class="gate-label">${label}</div>
      <div class="gate-value" title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</div>
    </div>
  `).join("");

  els.enabledToggle.checked = status.enabled;
  els.reconcile.disabled = !status.index_available;
  els.clearIndex.disabled = !status.index_available;
  els.indexStepCopy.textContent = status.index_available
    ? "Synchronize approved context with search."
    : `Unavailable: ${missingIndexDependencies.join(" + ") || "check retrieval configuration"}.`;
  els.reconcile.title = status.index_available
    ? ""
    : "Library retrieval is unavailable; configure MB_PGVECTOR_DB_URL and an embedding backend.";
  els.clearIndex.title = status.index_available
    ? "Delete Library retrieval documents without changing Library items or their AI context."
    : els.reconcile.title;
  els.statusNote.textContent = status.ai_features_enabled
    ? `${status.contexts.total} stored contexts · ${status.contexts.generated} generated · ${status.contexts.approved} approved`
    : "AI features are globally disabled; turning on generation alone will not make the job run.";
  els.runDetails.textContent = JSON.stringify(status, null, 2);
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value ?? "";
  return node.innerHTML;
}

function renderTypes() {
  const selected = els.typeFilter.value;
  const types = [...new Set(state.entities.map((entity) => entity.entity_type))].sort();
  els.typeFilter.innerHTML = '<option value="all">All item types</option>' +
    types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("");
  els.typeFilter.value = types.includes(selected) ? selected : "all";
}

function filteredEntities() {
  const query = els.search.value.trim().toLowerCase();
  const wantedStatus = els.statusFilter.value;
  const wantedType = els.typeFilter.value;
  return state.entities.filter((entity) => {
    const matchesText = !query || `${entity.name || ""} ${entity.description || ""} ${entity.entity_local_id}`.toLowerCase().includes(query);
    const matchesStatus = wantedStatus === "all" || entityStatus(entity) === wantedStatus;
    const matchesType = wantedType === "all" || entity.entity_type === wantedType;
    return matchesText && matchesStatus && matchesType;
  });
}

function renderEntities() {
  const visible = filteredEntities();
  const totals = Object.fromEntries(["missing", "generated", "invalidated", "approved", "approved-invalidated", "rewrite-requested"].map((key) => [key, 0]));
  state.entities.forEach((entity) => { totals[entityStatus(entity)] += 1; });
  els.counts.textContent = `${state.entities.length} items · ${totals.missing} missing · ${totals.generated} generated · ${totals.invalidated} source changed · ${totals.approved} approved · ${totals["approved-invalidated"]} approved + changed · ${totals["rewrite-requested"]} queued`;

  if (!visible.length) {
    els.entityList.innerHTML = '<div class="empty">No Library items match these filters.</div>';
    return;
  }

  els.entityList.innerHTML = visible.map((entity) => {
    const status = entityStatus(entity);
    return `
      <button class="entity-row" data-type="${escapeHtml(entity.entity_type)}" data-id="${entity.entity_local_id}">
        <span class="entity-type-icon" title="${escapeHtml(entity.entity_type)}" aria-label="${escapeHtml(entity.entity_type)}">${entityTypeIcon(entity.entity_type)}</span>
        <span class="entity-copy">
          <span class="entity-name">${escapeHtml(entity.name || `Untitled ${entity.entity_type}`)}</span>
          <span class="entity-description">${escapeHtml(entity.description || "No source description")}</span>
        </span>
        <span><span class="badge ${status}">${statusLabel(status)}</span></span>
        <span class="chevron">&rsaquo;</span>
      </button>`;
  }).join("");

  els.entityList.querySelectorAll(".entity-row").forEach((row) => {
    row.addEventListener("click", () => openEditor(row.dataset.type, Number(row.dataset.id)));
  });
}

function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatDuration(duration) {
  if (duration == null) return "Running";
  if (duration < 1000) return `${duration} ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)} s`;
  return `${Math.floor(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;
}

function runStatus(run) {
  if (run.status === "started") return "running";
  return run.outcome || run.status;
}

function runDescription(run) {
  if (run.outcome === "skipped") return `Skipped · ${(run.reason || "unknown reason").replaceAll("_", " ")}`;
  if (run.outcome === "failed") return run.message || "Generation failed";
  return run.status === "started" ? "Generation is in progress" : "Generation completed";
}

function formatCount(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function llmCallLabel(call) {
  const entity = state.entities.find((candidate) =>
    candidate.entity_type === call.entity_type && candidate.entity_local_id === call.entity_local_id
  );
  return {
    name: entity?.name || `${call.entity_type} ${call.entity_local_id}`,
    type: call.entity_type,
  };
}

function runSummaryMarkup(summary) {
  const stats = [
    ["generated", "Generated", "success"],
    ["candidates", "Candidates"],
    ["pending", "Pending"],
    ["errors", "Errors", summary.errors ? "error" : ""],
    ["skipped", "Other skipped"],
    ["already_approved", "Already approved"],
    ["restamped", "Restamped"],
  ];
  const usage = summary.usage || {};
  const reconcile = summary.reconcile || {};
  const index = reconcile.index || {};
  const execution = reconcile.execution || {};
  const llmCalls = summary.llm_calls || [];
  const longestCall = Math.max(...llmCalls.map((call) => call.duration_ms || 0), 1);
  const hasUsage = usage.input_tokens != null || usage.output_tokens != null;
  const hasReconcile = summary.reconcile != null;

  return `
    <div class="run-summary">
      <div class="run-stat-grid">
        ${stats.map(([key, label, tone = ""]) => `
          <span class="run-stat ${tone}">
            <strong>${formatCount(summary[key])}</strong>
            <small>${label}</small>
          </span>`).join("")}
      </div>
      ${(hasUsage || hasReconcile) ? `
        <div class="run-detail-groups">
          ${hasUsage ? `
            <span class="run-detail-group">
              <strong>Usage</strong>
              <span>${formatCount(usage.input_tokens)} input tokens</span>
              <span>${formatCount(usage.output_tokens)} output tokens</span>
            </span>` : ""}
          ${hasReconcile ? `
            <span class="run-detail-group">
              <strong>Index sync</strong>
              <span>${formatCount(index.inserted)} inserted</span>
              <span>${formatCount(index.deleted)} deleted</span>
              <span>${formatCount(index.unchanged)} unchanged</span>
              <span>${formatDuration(execution.ran_ms || 0)} runtime</span>
              ${execution.waited_ms ? `<span>${formatDuration(execution.waited_ms)} waiting</span>` : ""}
            </span>` : ""}
        </div>` : ""}
      ${llmCalls.length ? `
        <div class="llm-calls">
          <div class="llm-calls-heading">
            <strong>LLM calls</strong>
            <span>${llmCalls.length} sequential ${llmCalls.length === 1 ? "request" : "requests"}</span>
          </div>
          <div class="llm-call-list">
            ${llmCalls.map((call) => {
              const entity = llmCallLabel(call);
              const share = Math.max(2, Math.round(((call.duration_ms || 0) / longestCall) * 100));
              return `
                <div class="llm-call-row" style="--call-share: ${share}%">
                  <span class="entity-type-icon" title="${escapeHtml(entity.type)}" aria-label="${escapeHtml(entity.type)}">${entityTypeIcon(entity.type)}</span>
                  <span class="llm-call-entity">
                    <strong>${escapeHtml(entity.name)}</strong>
                    <small>${escapeHtml(entity.type)}</small>
                  </span>
                  <span class="llm-call-outcome">${escapeHtml(String(call.outcome || "completed").replaceAll("_", " "))}</span>
                  <span class="llm-call-tokens">${formatCount(call.input_tokens)} in · ${formatCount(call.output_tokens)} out</span>
                  <strong class="llm-call-duration">${escapeHtml(formatDuration(call.duration_ms))}</strong>
                </div>`;
            }).join("")}
          </div>
        </div>` : ""}
    </div>`;
}

function renderRuns() {
  if (!state.runs.length) {
    els.runList.innerHTML = '<div class="empty"><p>No generation attempts yet.</p><p>Run generation to create the first lifecycle entry.</p></div>';
    return;
  }

  els.runList.innerHTML = state.runs.map((run) => {
    const status = runStatus(run);
    return `
      <div class="run-row">
        <span class="run-marker ${escapeHtml(status)}"></span>
        <span class="run-main">
          <span class="run-title">${escapeHtml(status.replaceAll("_", " "))}</span>
          ${run.summary ? runSummaryMarkup(run.summary) : `<span class="run-description">${escapeHtml(runDescription(run))}</span>`}
          <span class="run-timestamps">
            <span class="run-time"><strong>Started</strong>${escapeHtml(formatTime(run.started_at))}</span>
            <span class="run-time"><strong>Ended</strong>${escapeHtml(formatTime(run.ended_at))}</span>
          </span>
        </span>
        <span class="run-duration">${escapeHtml(formatDuration(run.duration))}</span>
      </div>`;
  }).join("");
}

function renderIndexEntries() {
  if (state.indexBusy) {
    els.indexSummary.textContent = "Updating…";
    els.indexList.innerHTML = '<div class="empty">The index is updating…</div>';
    return;
  }
  els.indexSummary.textContent = `${state.indexEntries.length} ${state.indexEntries.length === 1 ? "document" : "documents"}`;
  els.indexList.innerHTML = state.indexEntries.length ? state.indexEntries.map((entry) => `
    <div class="index-entry">
      <div class="index-entry-heading">
        <span class="entity-type-icon" title="${escapeHtml(entry.entity_type)}" aria-label="${escapeHtml(entry.entity_type)}">${entityTypeIcon(entry.entity_type)}</span>
        <span>
          <strong>${escapeHtml(entry.entity_type)} ${entry.entity_local_id}</strong>
          <small>${escapeHtml(entry.doc_type)}</small>
        </span>
      </div>
      <div class="index-entry-text">${escapeHtml(entry.doc_text)}</div>
      <div class="index-entry-details">
        <span class="muted">${entry.vector_dimensions} dimensions</span>
        <span class="index-entry-meta">Document · ${escapeHtml(entry.doc_id)}</span>
        <span class="index-entry-meta">
          Vector ·
          <span class="vector-hash" tabindex="0" aria-describedby="vector-tooltip" data-vector="${escapeHtml(entry.vector_base64)}">${escapeHtml(entry.vector_hash)}</span>
        </span>
      </div>
    </div>`).join("") : '<div class="empty"><p>The Library index is empty.</p><p>Reconcile to populate it.</p></div>';

  els.indexList.querySelectorAll(".vector-hash").forEach((hash) => {
    hash.addEventListener("mouseenter", () => showVectorTooltip(hash));
    hash.addEventListener("mouseleave", scheduleVectorTooltipHide);
    hash.addEventListener("focus", () => showVectorTooltip(hash));
    hash.addEventListener("blur", hideVectorTooltip);
  });
}

function showVectorTooltip(target) {
  window.clearTimeout(hideVectorTooltip.timer);
  els.vectorTooltip.textContent = target.dataset.vector;
  els.vectorTooltip.classList.add("show");
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = els.vectorTooltip.getBoundingClientRect();
  const left = Math.max(12, Math.min(targetRect.right - tooltipRect.width, window.innerWidth - tooltipRect.width - 12));
  const above = targetRect.top - tooltipRect.height - 8;
  const top = above >= 12 ? above : Math.min(targetRect.bottom + 8, window.innerHeight - tooltipRect.height - 12);
  els.vectorTooltip.style.left = `${left}px`;
  els.vectorTooltip.style.top = `${top}px`;
}

function hideVectorTooltip() {
  window.clearTimeout(hideVectorTooltip.timer);
  els.vectorTooltip.classList.remove("show");
}

function scheduleVectorTooltipHide() {
  hideVectorTooltip.timer = window.setTimeout(hideVectorTooltip, 120);
}

els.vectorTooltip.addEventListener("mouseenter", () => window.clearTimeout(hideVectorTooltip.timer));
els.vectorTooltip.addEventListener("mouseleave", hideVectorTooltip);

function searchElements(engine) {
  return {
    appdb: { results: els.appdbSearchResults, summary: els.appdbSearchSummary },
    library: { results: els.librarySearchResults, summary: els.librarySearchSummary },
    semantic: { results: els.semanticSearchResults, summary: els.semanticSearchSummary },
  }[engine];
}

const comparisonSearchEngines = ["appdb", "semantic", "library"];
const idleSearchSummaries = {
  appdb: "Lexical results appear here.",
  library: "Matches can come from names, descriptions, synonyms, or example questions.",
  semantic: "Hybrid semantic results appear here.",
};
let comparisonSearchRevision = 0;

function scoreByName(result, name) {
  return result.scores?.find((score) => score.name === name)?.score;
}

function searchSignal(engine, result) {
  if (engine === "library") {
    return `${result.confidence || "unknown"} · similarity ${Number(result.similarity || 0).toFixed(3)}`;
  }
  if (engine === "semantic") {
    const similarity = scoreByName(result, "semantic-distance");
    if (similarity != null) return `semantic similarity ${Number(similarity).toFixed(3)}`;
  }
  if (scoreByName(result, "exact")) return "exact match";
  if (scoreByName(result, "prefix")) return "prefix match";
  return "ranked match";
}

function renderSearchResults(engine, response) {
  const { results, summary } = searchElements(engine);
  const weakNote = engine === "library" && response.weak_match ? " · top match is weak" : "";
  summary.textContent = `${response.total} ${response.total === 1 ? "match" : "matches"} · served by ${String(response.engine).replace("search.engine/", "")}${weakNote}`;
  results.innerHTML = response.data.length ? response.data.map((result, index) => `
    <div class="search-result">
      <span class="search-rank">${index + 1}</span>
      <span class="search-result-main">
        <span class="search-result-title">${escapeHtml(result.name || `Untitled ${result.model || result.type}`)}</span>
        ${result.description ? `<span class="search-result-description">${escapeHtml(result.description)}</span>` : ""}
        ${engine === "library" ? `<span class="search-result-match"><strong>Matched ${escapeHtml(result.matched_doc_type)}</strong> · ${escapeHtml(result.matched_text)}</span>` : ""}
        ${result.usage_instructions ? `<span class="search-result-instructions"><strong>Approved usage instructions</strong> · ${escapeHtml(result.usage_instructions)}</span>` : ""}
        <span class="search-result-meta">
          <span>${escapeHtml(result.model || result.type)} · ${escapeHtml(result.id)}</span>
          <span>${escapeHtml(result.database_name || result.collection?.name || "No location")}</span>
          <span class="search-signal">${escapeHtml(searchSignal(engine, result))}</span>
        </span>
      </span>
    </div>`).join("") : '<div class="empty">No results matched this query.</div>';
}

async function runComparisonSearch(engine, query, revision) {
  const { results, summary } = searchElements(engine);
  summary.textContent = `Searching ${engine}…`;
  results.innerHTML = '<div class="empty">Loading ranked results…</div>';
  try {
    const response = await request(`${apiBase}/search/${engine}?q=${encodeURIComponent(query)}`);
    if (comparisonSearchRevision !== revision) return;
    renderSearchResults(engine, response);
  } catch (error) {
    if (comparisonSearchRevision !== revision) return;
    summary.textContent = "Search failed";
    results.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function clearComparisonResults() {
  comparisonSearchEngines.forEach((engine) => {
    const { results, summary } = searchElements(engine);
    summary.textContent = idleSearchSummaries[engine];
    results.replaceChildren();
  });
}

function updateComparisonSearch(immediate = false) {
  window.clearTimeout(updateComparisonSearch.timer);
  const query = els.comparisonSearch.value.trim();
  const revision = ++comparisonSearchRevision;
  clearComparisonResults();
  if (!query) return;

  const run = () => comparisonSearchEngines.forEach((engine) => runComparisonSearch(engine, query, revision));
  if (immediate) run();
  else updateComparisonSearch.timer = window.setTimeout(run, 350);
}

els.comparisonSearch.addEventListener("input", () => updateComparisonSearch());
els.comparisonSearch.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  updateComparisonSearch(true);
});

function openEditor(type, id) {
  state.selected = state.entities.find((entity) => entity.entity_type === type && entity.entity_local_id === id);
  const entity = state.selected;
  const status = entityStatus(entity);
  els.editorKind.textContent = `${entity.entity_type} · ${statusLabel(status)}`;
  els.editorTitle.textContent = entity.name || `Untitled ${entity.entity_type}`;
  els.editorMeta.textContent = `ID ${entity.entity_local_id}${entity.context?.generator_version ? ` · ${entity.context.generator_version}` : ""}`;
  els.contextJson.value = JSON.stringify(entity.context?.ai_context || {
    instructions: "",
    synonyms: [],
    examples: [],
  }, null, 2);
  els.contextJson.dataset.savedValue = els.contextJson.value;
  els.sourceDescription.value = entity.description || "";
  els.sourceDescription.dataset.savedValue = els.sourceDescription.value;
  updateDescriptionSaveState();
  updateContextSaveState();
  els.validation.textContent = "";
  els.requestRewrite.disabled = !entity.context;
  els.promptDisclosure.open = false;
  els.promptDisclosure.dataset.loadedFor = "";
  els.promptVersion.textContent = "";
  els.promptSystem.textContent = "Expand to render the prompt.";
  els.promptUser.textContent = "";
  els.editor.showModal();
}

function updateDescriptionSaveState() {
  els.saveDescription.disabled = els.sourceDescription.value === els.sourceDescription.dataset.savedValue;
}

function contextDirty() {
  return els.contextJson.value !== els.contextJson.dataset.savedValue;
}

function updateContextSaveState() {
  const context = state.selected?.context;
  if (!context || contextDirty()) {
    els.save.textContent = "Save + approve";
    els.save.disabled = false;
  } else if (context.data_source === "human") {
    els.save.textContent = "Approved";
    els.save.disabled = true;
  } else {
    els.save.textContent = "Approve unchanged";
    els.save.disabled = false;
  }
}

async function loadRenderedPrompt() {
  const entity = state.selected;
  if (!entity) return;
  const entityKey = `${entity.entity_type}:${entity.entity_local_id}`;
  if (els.promptDisclosure.dataset.loadedFor === entityKey) return;

  els.promptSystem.textContent = "Rendering…";
  els.promptUser.textContent = "";
  els.promptVersion.textContent = "";
  try {
    const result = await request(`${apiBase}/entities/${encodeURIComponent(entity.entity_type)}/${entity.entity_local_id}/prompt`);
    if (state.selected !== entity) return;
    const messages = Object.fromEntries(result.messages.map((message) => [message.role, message.content]));
    els.promptVersion.textContent = `Version ${result.version}`;
    els.promptSystem.textContent = messages.system || "";
    els.promptUser.textContent = messages.user || "";
    els.promptDisclosure.dataset.loadedFor = entityKey;
  } catch (error) {
    els.promptSystem.textContent = "Could not render this prompt.";
    showToast(error.message, true);
  }
}

async function refreshIndexEntries() {
  window.clearTimeout(refreshIndexEntries.timer);
  return latestRefresh("index", () => request(`${apiBase}/index`), (result) => {
    els.indexList.setAttribute("aria-busy", String(result.busy));
    if (result.busy) {
      state.indexBusy = true;
      els.indexSummary.textContent = "Updating…";
      if (renderedSnapshots.index == null) renderIndexEntries();
      refreshIndexEntries.timer = window.setTimeout(() => {
        refreshIndexEntries().catch((error) => showToast(error.message, true));
      }, 100);
      return;
    }

    const view = { busy: result.busy, data: result.data };
    state.indexBusy = false;
    els.indexSummary.textContent = `${result.data.length} ${result.data.length === 1 ? "document" : "documents"}`;
    updateRenderedCollection("index", view, () => {
      state.indexEntries = result.data;
      renderIndexEntries();
    });
  });
}

function parsedContext() {
  try {
    const value = JSON.parse(els.contextJson.value);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("AI context must be a JSON object.");
    const unknown = Object.keys(value).filter((key) => !["instructions", "synonyms", "examples"].includes(key));
    if (unknown.length) throw new Error(`Unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
    els.validation.textContent = "";
    return value;
  } catch (error) {
    els.validation.textContent = error.message;
    throw error;
  }
}

async function saveContext(context, message) {
  const entity = state.selected;
  await mutate(["entities", "index"], `/api/osi/ai-context/${encodeURIComponent(entity.entity_type)}/${entity.entity_local_id}`, {
    method: "PUT",
    body: JSON.stringify({ ai_context: context }),
  });
  await refreshEntities();
  els.editor.close();
  showToast(message);
}

async function refreshStatus() {
  return latestRefresh("status", () => request(`${apiBase}/status`), (result) => {
    state.status = result;
    renderStatus();
  });
}

async function refreshEntities() {
  return latestRefresh("entities", () => request(`${apiBase}/entities`), (result) => {
    updateRenderedCollection("entities", result.data, () => {
      state.entities = result.data;
      renderTypes();
      renderEntities();
      if (renderedSnapshots.runs != null) renderRuns();
    });
  });
}

async function refreshRuns() {
  window.clearTimeout(refreshRuns.timer);
  return latestRefresh("runs", () => request(`${apiBase}/runs`), (result) => {
    updateRenderedCollection("runs", result.data, () => {
      state.runs = result.data;
      renderRuns();
    });
  });
}

function activeRunIds() {
  return new Set(state.runs.filter((run) => run.status === "started").map((run) => run.id));
}

function updateQueuedRunWatch() {
  if (!queuedRunWatch) {
    return false;
  }
  if (queuedRunWatch.id == null) {
    const run = state.runs.find((candidate) => !queuedRunWatch.knownIds.has(candidate.id));
    if (run) {
      queuedRunWatch.id = run.id;
    }
  }
  if (queuedRunWatch.id == null) {
    return false;
  }

  const run = state.runs.find((candidate) => candidate.id === queuedRunWatch.id);
  if (!run || run.status === "started") {
    return false;
  }
  if (!run.ended_at) runIdsAwaitingEnd.add(run.id);
  queuedRunWatch = null;
  return true;
}

function scheduleRunRefresh(delay = 1500) {
  window.clearTimeout(refreshRuns.timer);
  if (queuedRunWatch || activeRunIds().size || runIdsAwaitingEnd.size) {
    refreshRuns.timer = window.setTimeout(refreshRunProgress, delay);
  }
}

async function refreshRunProgress() {
  try {
    const activeBefore = activeRunIds();
    const [runsRefreshed] = await Promise.all([refreshRuns(), refreshStatus()]);
    if (!runsRefreshed) {
      return;
    }

    const activeAfter = activeRunIds();
    const activeRunFinished = [...activeBefore].some((id) => !activeAfter.has(id));
    activeBefore.forEach((id) => {
      const run = state.runs.find((candidate) => candidate.id === id);
      if (run && run.status !== "started" && !run.ended_at) runIdsAwaitingEnd.add(id);
    });
    [...runIdsAwaitingEnd].forEach((id) => {
      const run = state.runs.find((candidate) => candidate.id === id);
      if (!run || run.ended_at) runIdsAwaitingEnd.delete(id);
    });
    const queuedRunFinished = updateQueuedRunWatch();
    if (activeRunFinished || queuedRunFinished) {
      // Entity and index responses are moving intermediate snapshots while generation writes. Keep those
      // larger, scrollable lists stable during the run and paint their committed result once at the end.
      await Promise.all([refreshEntities(), refreshIndexEntries()]);
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    scheduleRunRefresh();
  }
}

async function refreshAll() {
  setBusy(els.refreshAll, true, "Refreshing…");
  try {
    await Promise.all([refreshStatus(), refreshEntities(), refreshRuns(), refreshIndexEntries()]);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    scheduleRunRefresh();
    setBusy(els.refreshAll, false);
  }
}

els.enabledToggle.addEventListener("change", async () => {
  els.enabledToggle.disabled = true;
  try {
    const result = await mutate(["status"], `${apiBase}/enabled`, {
      method: "PUT",
      body: JSON.stringify({ enabled: els.enabledToggle.checked }),
    });
    await Promise.all([refreshStatus(), refreshIndexEntries()]);
    showToast(result.enabled ? "Generation enabled" : "Generation disabled");
  } catch (error) {
    await refreshStatus().catch(() => {});
    showToast(error.message, true);
  } finally {
    els.enabledToggle.disabled = false;
  }
});

els.ensureJob.addEventListener("click", async () => {
  setBusy(els.ensureJob, true, "Ensuring…");
  try {
    await mutate(["status"], `${apiBase}/ensure-job`, { method: "POST" });
    await Promise.all([refreshStatus(), refreshIndexEntries()]);
    showToast("Scheduler is running and the generation job is registered");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(els.ensureJob, false);
  }
});

els.runGeneration.addEventListener("click", async () => {
  setBusy(els.runGeneration, true, "Queueing…");
  try {
    await mutate(["status"], `${apiBase}/ensure-job`, { method: "POST" });
    const knownIds = new Set(state.runs.map((run) => run.id));
    await mutate(["runs", "status", "entities", "index"], "/api/ee/osi-generation/generate", { method: "POST" });
    queuedRunWatch = { knownIds, id: null };
    scheduleRunRefresh(500);
    showToast("Generation run queued");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(els.runGeneration, false);
  }
});

els.deleteContexts.addEventListener("click", async () => {
  if (!window.confirm("Delete every stored AI context? Library items will remain and become generation candidates again.")) return;
  setBusy(els.deleteContexts, true, "Deleting…");
  try {
    const result = await mutate(["status", "entities", "index"], `${apiBase}/contexts`, { method: "DELETE" });
    await Promise.all([refreshStatus(), refreshEntities()]);
    showToast(`Deleted ${result.deleted} AI context${result.deleted === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(els.deleteContexts, false);
  }
});

els.deleteRuns.addEventListener("click", async () => {
  if (!window.confirm("Delete all OSI generation run history? Other task history will remain.")) return;
  setBusy(els.deleteRuns, true, "Deleting…");
  try {
    queuedRunWatch = null;
    runIdsAwaitingEnd.clear();
    const result = await mutate(["runs"], `${apiBase}/runs`, { method: "DELETE" });
    await refreshRuns();
    showToast(`Deleted ${result.deleted} generation run${result.deleted === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(els.deleteRuns, false);
  }
});

els.reconcile.addEventListener("click", async () => {
  setBusy(els.reconcile, true, "Reconciling…");
  try {
    const result = await mutate(["status", "index"], "/api/osi/ai-context/reconcile", { method: "POST" });
    await Promise.all([refreshStatus(), refreshIndexEntries()]);
    const elapsed = result.execution.waited_ms + result.execution.ran_ms;
    showToast(`Reconciled in ${formatDuration(elapsed)}: ${result.index.inserted} inserted, ${result.index.deleted} deleted`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(els.reconcile, false);
    els.reconcile.disabled = !state.status?.index_available;
  }
});

els.clearIndex.addEventListener("click", async () => {
  if (!window.confirm("Clear every document from the Library retrieval index? Library items and their AI context will remain; the next Reconcile will insert the documents again.")) return;
  setBusy(els.clearIndex, true, "Clearing…");
  try {
    const result = await mutate(["status", "index"], `${apiBase}/index`, { method: "DELETE" });
    await Promise.all([refreshStatus(), refreshIndexEntries()]);
    showToast(`Cleared ${result.deleted} Library index document${result.deleted === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(els.clearIndex, false);
    els.clearIndex.disabled = !state.status?.index_available;
  }
});

els.save.addEventListener("click", async () => {
  const approveUnchanged = Boolean(state.selected.context) && !contextDirty();
  setBusy(els.save, true, approveUnchanged ? "Approving…" : "Saving…");
  try {
    await saveContext(
      approveUnchanged ? state.selected.context.ai_context : parsedContext(),
      approveUnchanged ? "Context approved unchanged" : "Context saved and approved",
    );
  } catch (error) {
    if (!els.validation.textContent) showToast(error.message, true);
  } finally {
    setBusy(els.save, false);
  }
});

els.saveDescription.addEventListener("click", async () => {
  setBusy(els.saveDescription, true, "Saving…");
  els.sourceDescription.disabled = true;
  try {
    const entity = state.selected;
    await mutate(["entities", "index"], `${apiBase}/entities/${encodeURIComponent(entity.entity_type)}/${entity.entity_local_id}/description`, {
      method: "PUT",
      body: JSON.stringify({ description: els.sourceDescription.value }),
    });
    await refreshEntities();
    const refreshed = state.entities.find((candidate) =>
      candidate.entity_type === entity.entity_type && candidate.entity_local_id === entity.entity_local_id
    );
    state.selected = refreshed;
    els.sourceDescription.value = refreshed.description || "";
    els.sourceDescription.dataset.savedValue = els.sourceDescription.value;
    els.editorKind.textContent = `${refreshed.entity_type} · ${statusLabel(entityStatus(refreshed))}`;
    els.promptDisclosure.dataset.loadedFor = "";
    if (els.promptDisclosure.open) await loadRenderedPrompt();
    showToast(entityStatus(refreshed).startsWith("approved")
      ? "Source updated; approved context remains protected"
      : "Source updated; context is now eligible for regeneration");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    els.sourceDescription.disabled = false;
    setBusy(els.saveDescription, false);
    updateDescriptionSaveState();
  }
});

els.promptDisclosure.addEventListener("toggle", () => {
  if (els.promptDisclosure.open) loadRenderedPrompt();
});

els.requestRewrite.addEventListener("click", async () => {
  setBusy(els.requestRewrite, true, "Requesting…");
  try {
    const entity = state.selected;
    await mutate(["entities"], `/api/osi/ai-context/${encodeURIComponent(entity.entity_type)}/${entity.entity_local_id}/regenerate`, { method: "POST" });
    await refreshEntities();
    els.editor.close();
    showToast("Regeneration requested for the next run");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(els.requestRewrite, false);
  }
});

els.refreshAll.addEventListener("click", refreshAll);
els.search.addEventListener("input", renderEntities);
els.statusFilter.addEventListener("change", renderEntities);
els.typeFilter.addEventListener("change", renderEntities);
els.contextJson.addEventListener("input", () => {
  els.validation.textContent = "";
  updateContextSaveState();
});
els.sourceDescription.addEventListener("input", updateDescriptionSaveState);

refreshAll();
