import type {
  Element,
  ElementContent,
  Parent,
  Root,
  RootContent,
  Text,
} from "hast";

import S from "./AIMarkdown.module.css";

// Links are excluded because AIMarkdown's `a` override reads node.children[0].value
// to build smart links; code/tables are excluded to keep copy text and layout intact.
const SKIPPED_TAGS = new Set([
  "a",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "svg",
  "math",
  "script",
  "style",
]);

export type StreamWordsState = { animateFromChar: number | null };

const countChars = (node: Root | RootContent): number => {
  if (node.type === "text") {
    return node.value.length;
  }
  return "children" in node
    ? node.children.reduce((total, child) => total + countChars(child), 0)
    : 0;
};

const wrapWord = (word: string): Element => ({
  type: "element",
  tagName: "span",
  properties: { className: [S.streamedWord], "data-streamed-word": "" },
  children: [{ type: "text", value: word }],
});

/**
 * Wraps newly streamed words in fade-in spans. The boundary is frozen on first
 * parse so spans only ever get appended — React reuses same-index nodes, so a
 * moving boundary would swap text into an existing span and never re-fade it.
 */
export const createRehypeStreamWords =
  (state: StreamWordsState) => () => (tree: Root) => {
    if (state.animateFromChar === null) {
      state.animateFromChar = countChars(tree);
      return;
    }

    const animateFrom = state.animateFromChar;
    let offset = 0;

    const splitText = (node: Text): ElementContent[] | null => {
      const start = offset;
      offset += node.value.length;

      if (offset <= animateFrom) {
        return null;
      }

      const parts = node.value.split(/(\s+)/).filter(Boolean);
      const out: ElementContent[] = [];
      let cursor = start;
      let plain = "";

      for (const part of parts) {
        const partStart = cursor;
        cursor += part.length;
        const isWhitespace = /^\s+$/.test(part);

        // A word that started before the boundary was already visible; re-wrapping re-fades it.
        if (isWhitespace || partStart < animateFrom) {
          plain += part;
          continue;
        }
        if (plain) {
          out.push({ type: "text", value: plain });
          plain = "";
        }
        out.push(wrapWord(part));
      }
      if (plain) {
        out.push({ type: "text", value: plain });
      }

      const unchanged = out.length === 1 && out[0].type === "text";
      return unchanged ? null : out;
    };

    const walk = (parent: Parent) => {
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];

        if (child.type === "element") {
          if (SKIPPED_TAGS.has(child.tagName)) {
            offset += countChars(child);
            continue;
          }
          walk(child);
        } else if (child.type === "text") {
          const replacement = splitText(child);
          if (replacement) {
            parent.children.splice(i, 1, ...replacement);
            i += replacement.length - 1;
          }
        }
      }
    };

    walk(tree);
  };
