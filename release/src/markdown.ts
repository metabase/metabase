// A small, dependency-free Markdown -> HTML renderer.
//
// We deliberately avoid pulling in a markdown library: the input is either our
// own machine-generated release notes (headings / bold / links / bullet lists)
// or an LLM-authored theme summary, both of which stick to a common subset.
// Everything is HTML-escaped *first*, so the output is safe to inline into the
// self-contained report page even though the summary text is model-generated.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Inline formatting is applied to already-escaped text. Order matters: code
// spans first (their contents are taken verbatim), then links, then emphasis.
function renderInline(escaped: string): string {
  let out = escaped;

  // `code`
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  // [text](url) — url was escaped, so quotes are &quot; and can't break out of
  // the attribute. We only allow http(s) and mailto to avoid javascript: URIs.
  out = out.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g,
    (_m, text, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  );

  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);

  // _italic_ or *italic* (single, not part of **)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_m, pre, i) => `${pre}<em>${i}</em>`);
  out = out.replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, (_m, pre, i) => `${pre}<em>${i}</em>`);

  return out;
}

/** Render a Markdown string to an HTML fragment (no wrapping element). */
export function renderMarkdown(markdown: string): string {
  const lines = escapeHtml(markdown ?? "").split("\n");
  const html: string[] = [];

  let inList = false;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.trim() === "") {
      flushParagraph();
      closeList();
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      flushParagraph();
      closeList();
      html.push("<hr />");
      continue;
    }

    // ATX headings (#, ##, ...)
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    // Unordered list items (-, *, +)
    const listItem = line.match(/^\s*[-*+]\s+(.*)$/);
    if (listItem) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(listItem[1])}</li>`);
      continue;
    }

    // Otherwise accumulate into the current paragraph.
    closeList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}
