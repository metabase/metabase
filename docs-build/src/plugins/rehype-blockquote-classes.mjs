// Adds semantic CSS classes to <blockquote> elements based on the leading
// inline marker, mimicking GitHub's note/tip/warning callout style.
//
// Recognizes:
//   > **Note:** ...        → blockquote.note
//   > **Tip:** ...         → blockquote.tip
//   > **Warning:** ...     → blockquote.warning
//   > **Caution:** ...     → blockquote.warning
//   > **Danger:** ...      → blockquote.danger
//   > **Plans:** ...       → blockquote.plans-callout   (pricing / availability)
//
// Also leaves alone blockquotes already classed (e.g. an author-written
// .plans-callout).

import { visit } from "unist-util-visit";

const MARKERS = {
  note: "note",
  tip: "tip",
  hint: "tip",
  warning: "warning",
  caution: "warning",
  danger: "danger",
  plans: "plans-callout",
};

function existingClasses(node) {
  const cls = node.properties?.className;
  if (Array.isArray(cls)) return cls;
  if (typeof cls === "string") return cls.split(/\s+/);
  return [];
}

export function rehypeBlockquoteClasses() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "blockquote") return;
      const classes = existingClasses(node);
      // If author already classed it (e.g., .plans-callout), don't override.
      if (classes.some((c) => c.endsWith("-callout"))) return;

      // Find first text content inside the blockquote.
      const firstP = node.children?.find(
        (c) => c.type === "element" && c.tagName === "p",
      );
      if (!firstP) return;
      const strong = firstP.children?.find(
        (c) => c.type === "element" && c.tagName === "strong",
      );
      const text = strong?.children?.[0]?.value ?? "";
      const marker = text.replace(/:\s*$/, "").trim().toLowerCase();
      const kind = MARKERS[marker];
      if (!kind) return;

      node.properties = node.properties ?? {};
      const next = new Set(classes);
      next.add(kind);
      node.properties.className = Array.from(next);
    });
  };
}
