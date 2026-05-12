// Translates Jekyll Liquid `{% include ... %}` and `{% include_file ... %}`
// tags into HTML so the docs render without Jekyll.
//
// Handled tags:
//   {% include plans-blockquote.html feature="X" ... %}  → pricing callout
//   {% include youtube.html id="X" %}                    → YouTube embed
//   {% include svg-icons/whatever.svg %}                  → stripped (decorative)
//   {% include_file "path" snippet="X" %}                 → placeholder note
//   Any other {% include %} → stripped, with a console warning.

import { visit } from "unist-util-visit";

const INCLUDE_RE =
  /\{%\s*(include|include_file)\s+([^%]+?)\s*%\}/g;

function parseArgs(s) {
  const args = {};
  // Accept straight and curly quote characters (some docs use curly quotes).
  const re = /([\w-]+)\s*=\s*["“”‘’]([^"“”‘’]*)["“”‘’]/g;
  for (const m of s.matchAll(re)) {
    args[m[1]] = m[2];
  }
  return args;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPlansCallout(args) {
  const feature = args.feature ?? "This feature";
  const verb = args.is_plural === "true" ? "are" : "is";
  const enterpriseOnly = args["enterprise-only"] === "true";
  const selfHostedOnly = args["self-hosted-only"] === "true";
  const planLinks = enterpriseOnly
    ? '<a href="/product/enterprise" class="link-purple"><strong>Enterprise</strong></a> plans'
    : '<a href="/product/pro"><strong>Pro</strong></a> and ' +
      '<a href="/product/enterprise" class="link-purple"><strong>Enterprise</strong></a> plans';
  const hostingNote = selfHostedOnly
    ? " (only on self-hosted plans)"
    : " (both self-hosted and on Metabase Cloud)";
  return (
    '<blockquote class="plans-callout">' +
    `<p>${escapeHtml(feature)} ${verb} only available on ${planLinks}${hostingNote}.</p>` +
    "</blockquote>"
  );
}

function renderYouTube(args) {
  if (!args.id) return "";
  const id = encodeURIComponent(args.id);
  return (
    '<div class="youtube-embed">' +
    `<iframe src="https://www.youtube.com/embed/${id}" ` +
    'title="YouTube video player" frameborder="0" ' +
    'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
    'allowfullscreen></iframe>' +
    "</div>"
  );
}

function renderIncludeFile(rawArgs) {
  // {% include_file "path" snippet="X" %} — the body of the file isn't
  // available to us in this build. Emit a placeholder reference note.
  const args = parseArgs(rawArgs);
  const pathMatch = rawArgs.match(/["“”]([^"“”]+)["“”]/);
  const path = pathMatch ? pathMatch[1] : "external snippet";
  const snippet = args.snippet ? ` (${args.snippet})` : "";
  return (
    '<blockquote class="note">' +
    `<p>See the <code>${escapeHtml(path)}</code>${escapeHtml(snippet)} reference snippet.</p>` +
    "</blockquote>"
  );
}

function replaceInString(text) {
  return text.replace(INCLUDE_RE, (_full, kind, body) => {
    body = body.trim();
    if (kind === "include_file") return renderIncludeFile(body);

    const [name, ...rest] = body.split(/\s+/);
    const argString = rest.join(" ");
    const args = parseArgs(argString);

    if (name === "plans-blockquote.html") return renderPlansCallout(args);
    if (name === "youtube.html") return renderYouTube(args);
    if (name.startsWith("svg-icons/")) return ""; // decorative, drop
    // Unknown include — strip silently to avoid leaking raw Liquid into HTML.
    return "";
  });
}

export function remarkLiquidIncludes() {
  return (tree) => {
    visit(tree, (node, index, parent) => {
      // Plain text inside paragraphs may contain Liquid include tags.
      if (node.type === "paragraph") {
        if (!parent || index == null) return;
        const text = (node.children ?? [])
          .map((c) => (typeof c.value === "string" ? c.value : ""))
          .join("");
        if (!INCLUDE_RE.test(text)) return;
        INCLUDE_RE.lastIndex = 0;
        const replaced = replaceInString(text);
        parent.children[index] = { type: "html", value: replaced };
      }

      // Some docs use Liquid inside raw HTML blocks; remark exposes those as
      // type=html nodes. Rewrite their value in place.
      if (node.type === "html" && typeof node.value === "string") {
        if (INCLUDE_RE.test(node.value)) {
          INCLUDE_RE.lastIndex = 0;
          node.value = replaceInString(node.value);
        }
      }

      // Bare text nodes (rare for top-level paragraphs, but possible inside
      // list items or table cells).
      if (node.type === "text" && typeof node.value === "string") {
        if (INCLUDE_RE.test(node.value)) {
          INCLUDE_RE.lastIndex = 0;
          node.value = replaceInString(node.value);
        }
      }
    });
  };
}
