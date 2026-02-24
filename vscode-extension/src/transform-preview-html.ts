import type {
  TransformQuery,
  NativeTransformQuery,
  StructuredTransformQuery,
  TransformTarget,
  FieldReference,
} from "./transform-query";

export interface TransformPreviewData {
  name: string;
  description: string | null;
  query: TransformQuery | null;
  target: TransformTarget | null;
  filePath: string;
  entityId: string;
}

export function getTransformPreviewHtml(
  data: TransformPreviewData,
  nonce: string,
): string {
  const bodyContent = data.query
    ? data.query.type === "native"
      ? renderNativeQuery(data.query)
      : renderStructuredQuery(data.query)
    : '<p class="empty-state">Unable to parse query</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  ${getStyles()}
</head>
<body>
  ${renderHeader(data)}
  ${renderToolbar(data)}
  <div class="steps">
    ${bodyContent}
  </div>
  ${renderTarget(data.target)}
  ${getScript(nonce)}
</body>
</html>`;
}

function renderHeader(data: TransformPreviewData): string {
  const description = data.description
    ? `<p class="description">${escapeHtml(data.description)}</p>`
    : "";

  const database = data.query?.database ?? "";
  const databaseBadge = database
    ? `<span class="badge">${ICONS.database}${escapeHtml(database)}</span>`
    : "";

  return `<header>
  <div class="title-row">
    <h1>${escapeHtml(data.name)}</h1>
    ${databaseBadge}
  </div>
  ${description}
</header>`;
}

function renderToolbar(data: TransformPreviewData): string {
  return `<nav class="toolbar">
  <button class="toolbar-btn" data-action="openFile" data-path="${escapeAttr(data.filePath)}">${ICONS.fileText}View YAML</button>
  <button class="toolbar-btn" data-action="openGraph" data-entity-id="${escapeAttr(data.entityId)}">${ICONS.link}Dependency Graph</button>
</nav>`;
}

function renderTarget(target: TransformTarget | null): string {
  if (!target) return "";

  const ref = JSON.stringify([target.database, target.schema, target.name]);
  const tableName = target.schema
    ? `${target.schema}.${target.name}`
    : target.name;

  return `<footer>
  <span class="target-label">Target</span>
  <span class="target-arrow">${ICONS.arrowRight}</span>
  <a class="ref-link target-name" data-action="openTable" data-ref='${escapeAttr(ref)}'>${escapeHtml(tableName)}</a>
  <span class="badge">${ICONS.database}${escapeHtml(target.database)}</span>
</footer>`;
}

function renderNativeQuery(query: NativeTransformQuery): string {
  return `<div class="step step--brand">
  <div class="step-header">${ICONS.code}Native Query</div>
  <div class="step-body">
    <pre class="sql"><code>${highlightSql(query.sql)}</code></pre>
  </div>
</div>`;
}

function renderStructuredQuery(query: StructuredTransformQuery): string {
  const sections: string[] = [];

  const tableRef = JSON.stringify(query.sourceTable.ref);
  sections.push(renderStep(
    "brand",
    ICONS.table,
    query.sourceTable.display,
    `<a class="ref-link" data-action="openTable" data-ref='${escapeAttr(tableRef)}'>${escapeHtml(query.sourceTable.display)}</a>`,
  ));

  if (query.filters.length > 0) {
    const items = query.filters
      .map(
        (filter) =>
          `<div class="clause">${renderFieldRef(filter.column)} <span class="clause-op">${escapeHtml(filter.operator)}</span> <span class="clause-val">${escapeHtml(filter.value)}</span></div>`,
      )
      .join("");
    sections.push(renderStep("filter", ICONS.filter, "Filter", items));
  }

  if (query.aggregations.length > 0) {
    const items = query.aggregations
      .map((aggregation) => {
        const col = aggregation.column
          ? ` of ${renderFieldRef(aggregation.column)}`
          : "";
        return `<div class="clause"><span class="clause-op">${escapeHtml(aggregation.operator)}</span>${col}</div>`;
      })
      .join("");
    sections.push(renderStep("summarize", ICONS.chartLine, "Summarize", items));
  }

  if (query.breakouts.length > 0) {
    const items = query.breakouts
      .map((breakout) => `<div class="clause">${renderFieldRef(breakout)}</div>`)
      .join("");
    sections.push(renderStep("breakout", ICONS.boxes, "Group by", items));
  }

  if (query.orderBy.length > 0) {
    const items = query.orderBy
      .map(
        (order) =>
          `<div class="clause">${renderFieldRef(order.column)} <span class="clause-dir">${order.direction === "desc" ? "descending" : "ascending"}</span></div>`,
      )
      .join("");
    sections.push(renderStep("muted", ICONS.arrowUpDown, "Sort", items));
  }

  if (query.limit !== null) {
    sections.push(
      renderStep("muted", ICONS.hash, "Row limit", `<div class="clause">${query.limit}</div>`),
    );
  }

  return sections.join("");
}

function renderFieldRef(field: FieldReference): string {
  if (field.ref.length >= 4) {
    const ref = JSON.stringify(field.ref);
    return `<a class="ref-link clause-col" data-action="openField" data-ref='${escapeAttr(ref)}'>${escapeHtml(field.display)}</a>`;
  }
  if (field.ref.length >= 3) {
    const ref = JSON.stringify(field.ref);
    return `<a class="ref-link clause-col" data-action="openTable" data-ref='${escapeAttr(ref)}'>${escapeHtml(field.display)}</a>`;
  }
  return `<span class="clause-col">${escapeHtml(field.display)}</span>`;
}

function renderStep(
  variant: string,
  icon: string,
  title: string,
  content: string,
): string {
  return `<div class="step step--${variant}">
  <div class="step-header">${icon}${escapeHtml(title)}</div>
  <div class="step-body">${content}</div>
</div>`;
}

function highlightSql(sql: string): string {
  const escaped = escapeHtml(sql);

  const keywords =
    /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|ILIKE|IS|NULL|AS|ON|JOIN|INNER|LEFT|RIGHT|OUTER|FULL|CROSS|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|VIEW|WITH|CASE|WHEN|THEN|ELSE|END|ASC|DESC|COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|NULLIF|TRUE|FALSE)\b/gi;

  const strings = /('[^']*')/g;
  const numbers = /\b(\d+(?:\.\d+)?)\b/g;
  const singleLineComments = /(--[^\n]*)/g;
  const multiLineComments = /(\/\*[\s\S]*?\*\/)/g;

  type Token = { start: number; end: number; replacement: string };
  const tokens: Token[] = [];

  function collectTokens(
    pattern: RegExp,
    className: string,
    source: string,
  ) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        replacement: `<span class="sql-${className}">${match[0]}</span>`,
      });
    }
  }

  collectTokens(multiLineComments, "comment", escaped);
  collectTokens(singleLineComments, "comment", escaped);
  collectTokens(strings, "string", escaped);
  collectTokens(keywords, "keyword", escaped);
  collectTokens(numbers, "number", escaped);

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  const filtered: Token[] = [];
  let lastEnd = 0;
  for (const token of tokens) {
    if (token.start >= lastEnd) {
      filtered.push(token);
      lastEnd = token.end;
    }
  }

  let result = "";
  let cursor = 0;
  for (const token of filtered) {
    result += escaped.slice(cursor, token.start);
    result += token.replacement;
    cursor = token.end;
  }
  result += escaped.slice(cursor);

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function svg(paths: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const ICONS = {
  table: svg(
    '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  ),
  filter: svg(
    '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  ),
  chartLine: svg(
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  ),
  boxes: svg(
    '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  ),
  code: svg(
    '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  ),
  database: svg(
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  ),
  fileText: svg(
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  ),
  link: svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ),
  hash: svg(
    '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  ),
  arrowUpDown: svg(
    '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  ),
  arrowRight: svg(
    '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  ),
};

function getScript(nonce: string): string {
  return `<script nonce="${nonce}">
    var vscode = acquireVsCodeApi();
    document.addEventListener('click', function(event) {
      var el = event.target;
      while (el && el !== document.body) {
        if (el.dataset && el.dataset.action) {
          event.preventDefault();
          var msg = { type: el.dataset.action };
          if (el.dataset.ref) msg.ref = JSON.parse(el.dataset.ref);
          if (el.dataset.path) msg.filePath = el.dataset.path;
          if (el.dataset.entityId) msg.entityId = el.dataset.entityId;
          vscode.postMessage(msg);
          return;
        }
        el = el.parentElement;
      }
    });
  </script>`;
}

function getStyles(): string {
  // Metabase palette (works across light/dark via VS Code theme vars for neutrals)
  // Step colors from Metabase: octopus[50], palm[50], blue[40], accent4, orionAlpha[40]
  return `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.6;
      padding: 32px;
      max-width: 720px;
    }

    /* ---- Header ---- */
    header { margin-bottom: 20px; }

    .title-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      flex-wrap: wrap;
    }

    h1 {
      font-size: 1.5em;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }

    .description {
      margin-top: 6px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.8em;
      font-weight: 500;
      background: var(--vscode-badge-background, rgba(128,128,128,.15));
      color: var(--vscode-badge-foreground, var(--vscode-foreground));
      white-space: nowrap;
      vertical-align: middle;
    }

    .badge svg { width: 12px; height: 12px; flex-shrink: 0; opacity: .7; }

    /* ---- Toolbar ---- */
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }

    .toolbar-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,.3));
      background: transparent;
      color: var(--vscode-foreground);
      font: inherit;
      font-size: 0.85em;
      cursor: pointer;
      transition: background 150ms;
    }

    .toolbar-btn:hover {
      background: var(--vscode-list-hoverBackground, rgba(128,128,128,.08));
    }

    .toolbar-btn svg { flex-shrink: 0; opacity: .6; }

    /* ---- Steps ---- */
    .steps {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .step { border-radius: 8px; }
    .step:first-child { border-radius: 12px 12px 8px 8px; }
    .step:last-child { border-radius: 8px 8px 12px 12px; }
    .step:only-child { border-radius: 12px; }

    .step-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      font-weight: 700;
      font-size: 0.85em;
      letter-spacing: 0.01em;
    }

    .step-header svg { flex-shrink: 0; }

    .step-body {
      padding: 8px 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Step color variants — Metabase notebook palette */
    .step--brand  { background: hsla(208, 72%, 60%, .08); }
    .step--brand  .step-header { color: hsla(208, 72%, 60%, 1); }

    .step--filter  { background: hsla(240, 65%, 69%, .08); }
    .step--filter  .step-header { color: hsla(240, 65%, 69%, 1); }

    .step--summarize  { background: hsla(89, 48%, 40%, .08); }
    .step--summarize  .step-header { color: hsla(89, 48%, 40%, 1); }

    .step--breakout  { background: hsla(46, 81%, 52%, .08); }
    .step--breakout  .step-header { color: hsla(46, 81%, 52%, 1); }

    .step--muted  { background: var(--vscode-editor-background); border: 1px solid var(--vscode-input-border, rgba(128,128,128,.2)); }
    .step--muted  .step-header { color: var(--vscode-descriptionForeground); }

    /* Clauses */
    .clause {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
      line-height: 1.7;
    }

    .clause-col { font-weight: 600; }

    .clause-op {
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }

    .clause-val { }

    .clause-dir {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }

    /* Clickable references */
    .ref-link {
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      border-bottom: 1px dashed var(--vscode-descriptionForeground);
      transition: color 150ms, border-color 150ms;
    }

    .ref-link:hover {
      color: hsla(208, 72%, 60%, 1);
      border-bottom-color: hsla(208, 72%, 60%, 1);
    }

    /* SQL block */
    .sql {
      background: transparent;
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.7;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .sql-keyword { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); font-weight: 600; text-transform: uppercase; }
    .sql-string  { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
    .sql-number  { color: var(--vscode-symbolIcon-numberForeground, #b5cea8); }
    .sql-comment { color: var(--vscode-symbolIcon-commentForeground, #6a9955); font-style: italic; }

    /* Footer */
    footer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--vscode-input-border, rgba(128,128,128,.2));
      font-size: 0.9em;
    }

    .target-label {
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.8em;
      letter-spacing: 0.04em;
    }

    .target-arrow {
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
    }

    .target-name {
      font-weight: 600;
      font-family: var(--vscode-editor-font-family, monospace);
    }

    .empty-state {
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 48px 16px;
    }
  </style>`;
}
