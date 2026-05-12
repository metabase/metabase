// Translates Jekyll Liquid `{% include ... %}` and `{% include_file ... %}`
// tags into mdast nodes so the docs render without Jekyll.
//
// Handled tags:
//   {% include plans-blockquote.html feature="X" ... %}  → pricing callout
//   {% include youtube.html id="X" %}                    → YouTube embed
//   {% include svg-icons/whatever.svg %}                  → stripped (decorative)
//   {% include_file "path" %}                             → file content spliced inline
//   {% include_file "path" snippet="X" %}                 → named region from file
//   Any other {% include %} → stripped, with a build warning.
//
// `{{ dirname }}` inside an include_file path is resolved to the directory of
// the consuming markdown file (matching jekyll_include_plugin semantics).
//
// Snippet markers in source files:
//   .md           : <!-- [<snippet NAME>] --> … <!-- [<endsnippet NAME>] -->
//   .ts/.tsx/...  : // [<snippet NAME>] … // [<endsnippet NAME>]   (allowed leading whitespace, dedented on output)
//
// `.md` snippets are parsed with mdast-util-from-markdown (+ GFM) and spliced
// into the tree so headings/tables/links flow through the rest of the rehype
// pipeline. Source-code snippets become a single fenced `code` node so Shiki
// handles highlighting.

import fs from "node:fs";
import path from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

const INCLUDE_RE = /\{%\s*(include_file|include)\s+([^%]+?)\s*%\}/g;
// A paragraph is "purely one include_file" if its trimmed text is exactly one tag.
const SOLO_INCLUDE_FILE_RE = /^\{%\s*include_file\s+(.+?)\s*%\}$/;

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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function renderIncludeFilePlaceholder(rawArgs) {
  // Last-resort fallback when expansion fails (missing file, missing snippet,
  // or mixed prose+tag paragraph). Emits the same blockquote the build used
  // before snippet expansion landed, so the page still renders.
  const args = parseArgs(rawArgs);
  const pathMatch = rawArgs.match(/["“”]([^"“”]+)["“”]/);
  const refPath = pathMatch ? pathMatch[1] : "external snippet";
  const snippet = args.snippet ? ` (${args.snippet})` : "";
  return (
    '<blockquote class="note">' +
    `<p>See the <code>${escapeHtml(refPath)}</code>${escapeHtml(snippet)} reference snippet.</p>` +
    "</blockquote>"
  );
}

// Source path of the current markdown file. remark-mdast exposes the source
// file via vfile.history[0] (the original absolute path).
function dirnameOf(file) {
  const src = file && Array.isArray(file.history) && file.history[0];
  return src ? path.dirname(src) : process.cwd();
}

function resolveIncludePath(rawPath, dirname) {
  const substituted = rawPath.replace(/\{\{\s*dirname\s*\}\}/g, dirname);
  return path.isAbsolute(substituted)
    ? substituted
    : path.resolve(dirname, substituted);
}

function extractSnippet(content, snippetName, ext) {
  if (!snippetName) return content;
  const nameEsc = escapeRegex(snippetName);
  let startRe;
  let endRe;
  if (ext === ".md") {
    startRe = new RegExp(`<!--\\s*\\[<snippet\\s+${nameEsc}>\\]\\s*-->`);
    endRe = new RegExp(`<!--\\s*\\[<endsnippet\\s+${nameEsc}>\\]\\s*-->`);
  } else {
    startRe = new RegExp(
      `^[ \\t]*//\\s*\\[<snippet\\s+${nameEsc}>\\][ \\t]*$`,
      "m",
    );
    endRe = new RegExp(
      `^[ \\t]*//\\s*\\[<endsnippet\\s+${nameEsc}>\\][ \\t]*$`,
      "m",
    );
  }
  const startMatch = startRe.exec(content);
  if (!startMatch) return null;
  const afterStart = content.slice(startMatch.index + startMatch[0].length);
  const endMatch = endRe.exec(afterStart);
  if (!endMatch) return null;
  return afterStart.slice(0, endMatch.index);
}

function dedent(text) {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const m = line.match(/^[ \t]*/);
    const indent = m ? m[0].length : 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (minIndent === Infinity || minIndent === 0) return lines.join("\n");
  return lines.map((l) => l.slice(Math.min(minIndent, l.length))).join("\n");
}

function extToLang(ext) {
  switch (ext) {
    case ".ts":
      return "ts";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "js";
    case ".jsx":
      return "jsx";
    case ".json":
      return "json";
    case ".html":
      return "html";
    case ".css":
      return "css";
    case ".scss":
      return "scss";
    case ".sh":
    case ".bash":
      return "bash";
    case ".rb":
      return "ruby";
    case ".py":
      return "python";
    case ".yml":
    case ".yaml":
      return "yaml";
    default:
      return "";
  }
}

function parseMarkdownChildren(value) {
  const tree = fromMarkdown(value, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return tree.children;
}

// Returns mdast nodes to splice in, or null on failure (caller emits warning
// and falls back to the placeholder blockquote).
function expandIncludeFile(rawArgs, file) {
  const dirname = dirnameOf(file);
  const pathMatch = rawArgs.match(/["“”]([^"“”]+)["“”]/);
  if (!pathMatch) return null;
  const includePath = resolveIncludePath(pathMatch[1], dirname);

  const args = parseArgs(rawArgs);
  const snippetName = args.snippet ?? null;

  let raw;
  try {
    raw = fs.readFileSync(includePath, "utf8");
  } catch (err) {
    file?.message?.(
      `include_file: cannot read ${includePath}: ${err.message}`,
    );
    return null;
  }

  const ext = path.extname(includePath).toLowerCase();
  const region = extractSnippet(raw, snippetName, ext);
  if (region == null) {
    file?.message?.(
      `include_file: snippet "${snippetName}" not found in ${includePath}`,
    );
    return null;
  }

  if (ext === ".md") {
    return parseMarkdownChildren(region.trim());
  }
  const lang = extToLang(ext);
  return [{ type: "code", lang: lang || null, value: dedent(region) }];
}

// For paragraphs that aren't a solo include_file (e.g. include tags in inline
// prose, lists, or table cells), keep the original text-replace pipeline.
function replaceInString(text, file) {
  return text.replace(INCLUDE_RE, (_full, kind, body) => {
    body = body.trim();
    if (kind === "include_file") return renderIncludeFilePlaceholder(body);

    const [name, ...rest] = body.split(/\s+/);
    const argString = rest.join(" ");
    const args = parseArgs(argString);

    if (name === "plans-blockquote.html") return renderPlansCallout(args);
    if (name === "youtube.html") return renderYouTube(args);
    if (name.startsWith("svg-icons/")) return ""; // decorative, drop
    file?.message?.(`unknown include "${name}" — stripped`);
    return "";
  });
}

function flattenText(paragraph) {
  return (paragraph.children ?? [])
    .map((c) => (typeof c.value === "string" ? c.value : ""))
    .join("");
}

// Walk top-down so includes in spliced subtrees would also be processed. We
// build a new children array rather than mutating during a `visit` traversal
// because splicing one paragraph may produce many nodes.
function transformTree(node, file) {
  if (!node || !Array.isArray(node.children)) return;
  const newChildren = [];
  for (const child of node.children) {
    if (child.type === "paragraph") {
      const trimmed = flattenText(child).trim();
      const soloMatch = trimmed.match(SOLO_INCLUDE_FILE_RE);
      if (soloMatch) {
        const expanded = expandIncludeFile(soloMatch[1], file);
        if (expanded && expanded.length > 0) {
          for (const n of expanded) {
            transformTree(n, file);
            newChildren.push(n);
          }
          continue;
        }
        // Fall through to the text-replace branch as a placeholder.
      }
      // Mixed paragraph (prose + include tag) or expansion failed → string replace.
      if (INCLUDE_RE.test(trimmed)) {
        INCLUDE_RE.lastIndex = 0;
        newChildren.push({
          type: "html",
          value: replaceInString(trimmed, file),
        });
        continue;
      }
    }

    // Fenced code blocks may wrap one or more include_file tags (Jekyll
    // expanded includes before markdown parsed, so the file contents ended up
    // inside the fence). Replace each tag with its snippet's raw text,
    // preserving the author's chosen language tag on the surrounding fence.
    if (child.type === "code" && typeof child.value === "string") {
      const value = child.value;
      const includeFileRe = /\{%\s*include_file\s+(.+?)\s*%\}/g;
      if (includeFileRe.test(value)) {
        includeFileRe.lastIndex = 0;
        const replaced = value.replace(includeFileRe, (_match, rawArgs) => {
          const expanded = expandIncludeFile(rawArgs, file);
          if (expanded && expanded.length === 1 && expanded[0].type === "code") {
            return expanded[0].value;
          }
          if (expanded && expanded.length > 0) {
            // Markdown inside a code fence — render the source text rather
            // than failing the build. Very rare.
            return expanded
              .map((n) => (typeof n.value === "string" ? n.value : ""))
              .join("\n");
          }
          file?.message?.(`include_file inside code fence could not expand: ${rawArgs}`);
          return _match; // leave the tag as-is so the warning is visible
        });
        child.value = replaced;
      }
    }

    // Raw HTML blocks may also contain include tags (rare).
    if (child.type === "html" && typeof child.value === "string") {
      if (INCLUDE_RE.test(child.value)) {
        INCLUDE_RE.lastIndex = 0;
        child.value = replaceInString(child.value, file);
      }
    }

    // Inline text in lists, table cells, etc.
    if (child.type === "text" && typeof child.value === "string") {
      if (INCLUDE_RE.test(child.value)) {
        INCLUDE_RE.lastIndex = 0;
        child.value = replaceInString(child.value, file);
      }
    }

    transformTree(child, file);
    newChildren.push(child);
  }
  node.children = newChildren;
}

export function remarkLiquidIncludes() {
  return (tree, file) => {
    transformTree(tree, file);
  };
}
