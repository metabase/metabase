import type { Element, Root } from "hast";

import {
  type StreamWordsState,
  createRehypeStreamWords,
} from "./rehypeStreamWords";

const text = (value: string) => ({ type: "text" as const, value });

const element = (tagName: string, children: Element["children"]): Element => ({
  type: "element",
  tagName,
  properties: {},
  children,
});

const root = (children: Root["children"]): Root => ({ type: "root", children });

const run = (state: StreamWordsState, tree: Root) => {
  createRehypeStreamWords(state)()(tree);
  return tree;
};

const spans = (node: Root | Element): Element[] =>
  node.children.flatMap((child) =>
    child.type === "element"
      ? [...(child.tagName === "span" ? [child] : []), ...spans(child)]
      : [],
  );

const spanWords = (node: Root | Element) =>
  spans(node).map((span) =>
    span.children[0].type === "text" ? span.children[0].value : "",
  );

const freshState = (): StreamWordsState => ({ animateFromChar: null });

describe("createRehypeStreamWords", () => {
  it("should wrap nothing on the first parse and freeze the boundary", () => {
    const state = freshState();
    const tree = run(state, root([element("p", [text("Hello world")])]));

    expect(spans(tree)).toHaveLength(0);
    expect(state.animateFromChar).toBe("Hello world".length);
  });

  it("should be idempotent on the first parse for StrictMode double renders", () => {
    const state = freshState();
    run(state, root([element("p", [text("Hello world")])]));
    const frozen = state.animateFromChar;

    run(state, root([element("p", [text("Hello world")])]));

    expect(state.animateFromChar).toBe(frozen);
  });

  it("should wrap only words appended after the boundary", () => {
    const state: StreamWordsState = { animateFromChar: 6 };
    const tree = run(state, root([element("p", [text("Hello world again")])]));

    expect(spanWords(tree)).toEqual(["world", "again"]);
  });

  it("should leave a word that started before the boundary unwrapped", () => {
    const state: StreamWordsState = { animateFromChar: 3 };
    const tree = run(state, root([element("p", [text("Hello world")])]));

    expect(spanWords(tree)).toEqual(["world"]);
  });

  it("should preserve whitespace outside of spans", () => {
    const state: StreamWordsState = { animateFromChar: 0 };
    const paragraph = element("p", [text("a b")]);
    run(state, root([paragraph]));

    const values = paragraph.children.map((child) =>
      child.type === "text" ? child.value : "span",
    );
    expect(values).toEqual(["span", " ", "span"]);
  });

  it.each(["a", "pre", "code", "table", "svg"])(
    "should not wrap words inside %s",
    (tagName) => {
      const state: StreamWordsState = { animateFromChar: 0 };
      const tree = run(
        state,
        root([element(tagName, [text("untouched words here")])]),
      );

      expect(spans(tree)).toHaveLength(0);
    },
  );

  it("should still count skipped subtrees so later offsets stay aligned", () => {
    const state: StreamWordsState = { animateFromChar: 6 };
    const tree = run(
      state,
      root([element("code", [text("abcdef")]), element("p", [text("after")])]),
    );

    expect(spanWords(tree)).toEqual(["after"]);
  });
});
