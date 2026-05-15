// Expands `{% include_file "path" [snippet="NAME"] %}` transclusion tags.
//
// The SDK docs pull example code straight out of committed, type-checked
// source files (docs/embedding/sdk/snippets/**.tsx) and prop tables out of
// generated typedoc output (docs/embedding/sdk/api/snippets/*.md,
// docs/embedding/eajs/snippets/*.md), so the docs can't drift from the
// real types/examples. `include_file` is the only build-time tag the
// markdown layer understands.
//
// Two shapes are handled (an audit of docs/ shows every `include_file` is one
// of these — nothing inline in prose / lists / tables):
//
//   1. A paragraph whose entire text is one tag:
//        {% include_file "{{ dirname }}/snippets/config/config-base.tsx" %}
//      → for a .md target: the file content (or named snippet region) is parsed
//        as markdown and spliced into the tree, so headings/tables/links flow
//        through the rest of the pipeline.
//      → for a source-code target: a single fenced `code` node (Shiki then
//        highlights it), language inferred from the extension, dedented.
//
//   2. A fenced code block containing one or more tags. Each tag is replaced
//      with the snippet's raw text; the author's chosen fence language is kept.
//
// `{{ dirname }}` in a path resolves to the directory of the consuming
// markdown file.
//
// Snippet markers in source files:
//   .md          : <!-- [<snippet NAME>] --> … <!-- [<endsnippet NAME>] -->
//   .ts/.tsx/...  : // [<snippet NAME>] … // [<endsnippet NAME>]   (leading
//                  whitespace allowed; output is dedented)
//
// On any failure (missing file, missing snippet) we emit a placeholder
// blockquote and a build warning via vfile rather than failing the build — a
// fresh `bun run docs:dev` checkout has the typedoc output ungenerated, and one
// bad include shouldn't take the whole site down.

import fs from "node:fs";
import path from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

const INCLUDE_FILE_RE = /\{%\s*include_file\s+([^%]+?)\s*%\}/g;
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

// Last-resort fallback when expansion fails (missing file or missing snippet).
function placeholderNode(rawArgs) {
  const args = parseArgs(rawArgs);
  const pathMatch = rawArgs.match(/["“”]([^"“”]+)["“”]/);
  const refPath = pathMatch ? pathMatch[1] : "external snippet";
  const snippet = args.snippet ? ` (${args.snippet})` : "";
  return {
    type: "html",
    value:
      '<blockquote class="note">' +
      `<p>See the <code>${escapeHtml(refPath)}</code>${escapeHtml(snippet)} reference snippet.</p>` +
      "</blockquote>",
  };
}

// Source path of the current markdown file. remark exposes it via vfile.history[0].
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
    startRe = new RegExp(`^[ \\t]*//\\s*\\[<snippet\\s+${nameEsc}>\\][ \\t]*$`, "m");
    endRe = new RegExp(`^[ \\t]*//\\s*\\[<endsnippet\\s+${nameEsc}>\\][ \\t]*$`, "m");
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
    case ".ts": return "ts";
    case ".tsx": return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs": return "js";
    case ".jsx": return "jsx";
    case ".json": return "json";
    case ".html": return "html";
    case ".css": return "css";
    case ".scss": return "scss";
    case ".sh":
    case ".bash": return "bash";
    case ".rb": return "ruby";
    case ".py": return "python";
    case ".yml":
    case ".yaml": return "yaml";
    default: return "";
  }
}

function parseMarkdownChildren(value) {
  const tree = fromMarkdown(value, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return tree.children;
}

// Returns mdast nodes to splice in, or null on failure (caller emits a warning
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
    file?.message?.(`include_file: cannot read ${includePath}: ${err.message}`);
    return null;
  }

  const ext = path.extname(includePath).toLowerCase();
  const region = extractSnippet(raw, snippetName, ext);
  if (region == null) {
    file?.message?.(`include_file: snippet "${snippetName}" not found in ${includePath}`);
    return null;
  }

  if (ext === ".md") {
    return parseMarkdownChildren(region.trim());
  }
  const lang = extToLang(ext);
  return [{ type: "code", lang: lang || null, value: dedent(region) }];
}

// Walk top-down so includes in spliced subtrees are also processed. We build a
// new children array rather than mutating during traversal because splicing one
// paragraph may produce many nodes.
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
        newChildren.push(placeholderNode(soloMatch[1]));
        continue;
      }
    }

    // Fenced code blocks may wrap one or more include_file tags. Replace each
    // with its snippet's raw text, keeping the author's chosen fence language.
    if (child.type === "code" && typeof child.value === "string" && INCLUDE_FILE_RE.test(child.value)) {
      INCLUDE_FILE_RE.lastIndex = 0;
      child.value = child.value.replace(INCLUDE_FILE_RE, (_match, rawArgs) => {
        const expanded = expandIncludeFile(rawArgs, file);
        if (expanded && expanded.length === 1 && expanded[0].type === "code") {
          return expanded[0].value;
        }
        if (expanded && expanded.length > 0) {
          // Markdown inside a code fence — emit the source text. Very rare.
          return expanded.map((n) => (typeof n.value === "string" ? n.value : "")).join("\n");
        }
        file?.message?.(`include_file inside code fence could not expand: ${rawArgs}`);
        return _match; // leave the tag visible so the warning is actionable
      });
    }

    transformTree(child, file);
    newChildren.push(child);
  }
  node.children = newChildren;
}

function flattenText(paragraph) {
  return (paragraph.children ?? [])
    .map((c) => (typeof c.value === "string" ? c.value : ""))
    .join("");
}

export function remarkIncludeFile() {
  return (tree, file) => {
    transformTree(tree, file);
  };
}
