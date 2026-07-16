import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

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

describe("CardEmbed node — chart_href attr", () => {
  it("round-trips a `chart_href` through parseHTML ↔ renderHTML", () => {
    const editor = makeEditor();
    const href = "/question/research/7/group/auto%3A42%3Ad1";

    editor.commands.insertContent({
      type: "cardEmbed",
      attrs: {
        id: 77,
        name: null,
        stored_result_id: 99,
        chart_href: href,
      },
    });

    const html = editor.getHTML();
    expect(html).toContain(`data-chart-href="${href}"`);

    const editor2 = makeEditor();
    editor2.commands.setContent(html);

    const node = editor2.state.doc.firstChild;
    expect(node?.type.name).toBe("cardEmbed");
    expect(node?.attrs.id).toBe(77);
    expect(node?.attrs.stored_result_id).toBe(99);
    expect(node?.attrs.chart_href).toBe(href);

    editor.destroy();
    editor2.destroy();
  });

  it("renders no `data-chart-href` attribute when null (non-exploration embeds stay clean)", () => {
    const editor = makeEditor();

    editor.commands.insertContent({
      type: "cardEmbed",
      attrs: { id: 42, name: null, stored_result_id: null, chart_href: null },
    });

    expect(editor.getHTML()).not.toContain("data-chart-href");
    editor.destroy();
  });
});
