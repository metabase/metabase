import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import type { DatasetQuery } from "metabase-types/api";

// The full Tiptap node imports a Redux-backed React component and a CSS
// module — neither matter for the schema-level round-trip. Stub
// `ReactNodeViewRenderer` to return a no-op node-view factory so the
// schema is created without dragging the React tree in.
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

// Sidecar CSS / module imports the real CardEmbedNode triggers — stub
// what `Node.create` needs but don't render anything.
jest.mock("./CardEmbedNode.module.css", () => ({}), { virtual: true });
jest.mock("./CardEmbedLoadingState", () => ({
  __esModule: true,
  CardEmbedLoadingState: () => null,
}));
jest.mock("./CardEmbedMenuDropdown", () => ({
  __esModule: true,
  CardEmbedMenuDropdown: () => null,
}));
jest.mock("./ExternalDocumentCardMenu", () => ({
  __esModule: true,
  ExternalDocumentCardMenu: () => null,
}));
jest.mock("./modals/ModifyQuestionModal", () => ({
  __esModule: true,
  ModifyQuestionModal: () => null,
}));
jest.mock("./use-update-card-operations", () => ({
  __esModule: true,
  useUpdateCardOperations: () => ({}),
}));

import { CardEmbed } from "./CardEmbedNode";

function makeEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, CardEmbed],
  });
}

const OVERRIDE: DatasetQuery = {
  type: "query",
  database: 1,
  query: {
    "source-table": 10,
    breakout: [["field", 200, { "temporal-unit": "day-of-week" }]],
  },
} as DatasetQuery;

describe("CardEmbed node — dataset_query attr", () => {
  it("round-trips a non-null `dataset_query` through parseHTML ↔ renderHTML", () => {
    const editor = makeEditor();

    // Insert a cardEmbed node carrying the override.
    editor.commands.insertContent({
      type: "cardEmbed",
      attrs: {
        id: 77,
        name: null,
        stored_result_id: 99,
        dataset_query: OVERRIDE,
      },
    });

    // Serialize → HTML, then reparse the HTML back into a doc, then read
    // the round-tripped attrs.
    const html = editor.getHTML();
    expect(html).toContain('data-dataset-query="');

    const editor2 = makeEditor();
    editor2.commands.setContent(html);

    const node = editor2.state.doc.firstChild;
    expect(node?.type.name).toBe("cardEmbed");
    expect(node?.attrs.id).toBe(77);
    expect(node?.attrs.stored_result_id).toBe(99);
    expect(node?.attrs.dataset_query).toEqual(OVERRIDE);

    editor.destroy();
    editor2.destroy();
  });

  it("renders no `data-dataset-query` attribute when the override is null (non-exploration embeds stay clean)", () => {
    const editor = makeEditor();

    editor.commands.insertContent({
      type: "cardEmbed",
      attrs: {
        id: 42,
        name: null,
        stored_result_id: null,
        dataset_query: null,
      },
    });

    const html = editor.getHTML();
    expect(html).not.toContain("data-dataset-query");

    editor.destroy();
  });

  it("ignores malformed `data-dataset-query` JSON instead of throwing", () => {
    const editor = makeEditor();

    editor.commands.setContent(
      `<div data-type="cardEmbed" data-id="7" data-dataset-query="not-json">x</div>`,
    );

    const node = editor.state.doc.firstChild;
    expect(node?.type.name).toBe("cardEmbed");
    expect(node?.attrs.dataset_query).toBeNull();

    editor.destroy();
  });
});
