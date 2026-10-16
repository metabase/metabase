import { Editor, type JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import type {
  ProductAnalyticsDocumentContext,
  ProductAnalyticsNodeDefinition,
} from "metabase-types/api";

// Only the schema matters here, not the React node view.
jest.mock("@tiptap/react", () => {
  const noopNodeView = () => ({
    dom: document.createElement("div"),
    update: () => true,
    destroy: () => {},
  });
  return {
    __esModule: true,
    ReactNodeViewRenderer: () => () => noopNodeView(),
    NodeViewWrapper: () => null,
  };
});
jest.mock("./AnalysisNodeView", () => ({
  __esModule: true,
  AnalysisNodeView: () => null,
}));

import { AnalysisNode } from "./AnalysisNode";
import {
  createAnalysisNodeContent,
  findAnalysisNode,
  getAnalysisNodeId,
  insertAnalysisNodeAfter,
  updateAnalysisNodeSettings,
} from "./analysis-node-utils";
import {
  AnalysisDocumentAttributes,
  readDocumentContext,
  writeDocumentContext,
} from "./document-context";

const FUNNEL: ProductAnalyticsNodeDefinition = {
  version: 1,
  kind: "funnel",
  settings: { "funnel.view": "overTime" },
};
const PATHS: ProductAnalyticsNodeDefinition = {
  version: 1,
  kind: "paths",
  settings: {},
};
const CONTEXT: ProductAnalyticsDocumentContext = {
  version: 1,
  table_id: 42,
  date_range: "past30days",
};

const createEditor = (content?: JSONContent | string) =>
  new Editor({
    extensions: [
      Document,
      Paragraph,
      Text,
      AnalysisDocumentAttributes,
      AnalysisNode,
    ],
    content,
  });

const createDocument = (...nodes: JSONContent[]): JSONContent => ({
  type: "doc",
  content: nodes,
});

const getAnalysisIds = (editor: Editor): string[] => {
  const ids: string[] = [];
  editor.state.doc.forEach((node) => {
    const id = getAnalysisNodeId(node);
    if (node.type.name === AnalysisNode.name && id !== undefined) {
      ids.push(id);
    }
  });
  return ids;
};

describe("document context", () => {
  it("is undefined until written", () => {
    expect(readDocumentContext(createEditor().state.doc)).toBeUndefined();
  });

  it("survives saving and loading the document", () => {
    const editor = createEditor();
    writeDocumentContext(editor, CONTEXT);

    const reloaded = createEditor(editor.getJSON());

    expect(readDocumentContext(reloaded.state.doc)).toEqual(CONTEXT);
  });
});

describe("analysis nodes", () => {
  it("survives copying and pasting as HTML", () => {
    const editor = createEditor(
      createDocument(createAnalysisNodeContent(FUNNEL, "a")),
    );

    const pasted = createEditor(editor.getHTML());

    expect(findAnalysisNode(pasted.state.doc, "a")?.definition).toEqual(FUNNEL);
  });

  it("merges setting changes into the node, without the document's settings", () => {
    const editor = createEditor(
      createDocument(createAnalysisNodeContent(FUNNEL, "a")),
    );

    updateAnalysisNodeSettings(editor, "a", {
      "funnel.view": "steps",
      "funnel.allow_retry": true,
      date_range: "past7days",
    });

    expect(findAnalysisNode(editor.state.doc, "a")?.definition).toEqual({
      ...FUNNEL,
      settings: { "funnel.view": "steps", "funnel.allow_retry": true },
    });
  });

  it("doesn't change the document when the settings don't change", () => {
    const editor = createEditor(
      createDocument(createAnalysisNodeContent(FUNNEL, "a")),
    );
    const before = editor.state.doc;

    updateAnalysisNodeSettings(editor, "a", { "funnel.view": "overTime" });

    expect(editor.state.doc).toBe(before);
  });

  it("inserts right after the source analysis", () => {
    const editor = createEditor(
      createDocument(
        createAnalysisNodeContent(FUNNEL, "a"),
        createAnalysisNodeContent(FUNNEL, "b"),
      ),
    );

    const inserted = insertAnalysisNodeAfter(editor, "a", PATHS);

    expect(getAnalysisIds(editor)).toEqual(["a", inserted, "b"]);
    expect(findAnalysisNode(editor.state.doc, inserted)?.definition).toEqual(
      PATHS,
    );
  });

  it("inserts at the end when the source analysis is gone", () => {
    const editor = createEditor(
      createDocument(createAnalysisNodeContent(FUNNEL, "a")),
    );

    const inserted = insertAnalysisNodeAfter(editor, "missing", PATHS);

    expect(getAnalysisIds(editor)).toEqual(["a", inserted]);
  });
});
