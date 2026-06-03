// Per-word entrance animation. Each text node is split into one <span> per word;
// the span's CSS animation (a quick blur-in) fires exactly once, when the span is
// first mounted. We deliberately do NOT track "which words are new" ourselves:
// react-markdown rebuilds its element tree every render, but React reconciles by
// position and hast-util-to-jsx-runtime gives the spans position-stable keys
// (span-0, span-1, …). For append-only streaming text that means earlier word
// spans keep their DOM nodes — so their animation never re-fires — while only the
// freshly-appended words mount and blur in. The cascade you see is therefore
// paced by *when words are revealed* (see useSmoothText), i.e. by the stream, not
// by a fixed CSS stagger.

type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};
type HastNode =
  | HastText
  | HastElement
  | { type: string; children?: HastNode[] };

// Text inside these tags is left untouched: code/pre are rendered verbatim,
// svg/math are not prose, and `a` must keep its single text child intact so the
// AIMarkdown link override can read `node.children[0].value` for smart links.
const SKIP_TAGS = new Set(["a", "code", "pre", "svg", "math"]);

const isElement = (node: HastNode): node is HastElement =>
  node.type === "element";

const isText = (node: HastNode): node is HastText => node.type === "text";

const wrapWord = (word: string): HastElement => ({
  type: "element",
  tagName: "span",
  properties: { dataAnimWord: "true" },
  children: [{ type: "text", value: word }],
});

const splitTextNode = (node: HastText): HastNode[] => {
  // keep whitespace as its own (unwrapped) text node so spacing is preserved and
  // only words carry the animation marker.
  const parts = node.value.split(/(\s+)/);
  const out: HastNode[] = [];
  for (const part of parts) {
    if (part === "") {
      continue;
    }
    out.push(
      /^\s+$/.test(part) ? { type: "text", value: part } : wrapWord(part),
    );
  }
  return out;
};

const visit = (node: HastNode, skip: boolean): void => {
  if (!("children" in node) || !node.children) {
    return;
  }
  const childSkip = skip || (isElement(node) && SKIP_TAGS.has(node.tagName));

  if (childSkip) {
    node.children.forEach((child) => visit(child, true));
    return;
  }

  const next: HastNode[] = [];
  for (const child of node.children) {
    if (isText(child)) {
      next.push(...splitTextNode(child));
    } else {
      visit(child, false);
      next.push(child);
    }
  }
  node.children = next;
};

export const rehypeAnimate = () => (tree: HastNode) => visit(tree, false);
