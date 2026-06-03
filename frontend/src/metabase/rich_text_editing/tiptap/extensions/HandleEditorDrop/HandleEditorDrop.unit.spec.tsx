import type { EditorView } from "@tiptap/pm/view";

import {
  ARTIFACT_DND_MIME,
  setArtifactDragData,
} from "metabase/metabot/components/MetabotBar/artifactDragData";

import { handleArtifactDrop } from "./HandleEditorDrop";

function createMockDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  const dt = {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return [...store.keys()];
    },
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? "",
  };
  return dt as unknown as DataTransfer;
}

function createMockView() {
  const node = { name: "resizeNode" };
  const transaction: { insert: jest.Mock } = {
    insert: jest.fn(() => transaction),
  };
  const dispatch = jest.fn();
  const view = {
    dispatch,
    posAtCoords: jest.fn(() => ({ pos: 5 })),
    state: {
      selection: { from: 0 },
      doc: { resolve: jest.fn(() => ({ depth: 1, after: () => 8 })) },
      schema: { nodeFromJSON: jest.fn(() => node) },
      get tr() {
        return transaction;
      },
    },
  };
  return { view, transaction, dispatch, node };
}

function createMockDropEvent(dataTransfer: DataTransfer) {
  return {
    dataTransfer,
    clientX: 10,
    clientY: 20,
    preventDefault: jest.fn(),
  };
}

describe("handleArtifactDrop", () => {
  it("inserts a cardEmbed at the drop position and claims the drop", () => {
    const dataTransfer = createMockDataTransfer();
    setArtifactDragData(dataTransfer, { model: "card", id: 22 });
    const { view, transaction, dispatch, node } = createMockView();
    const event = createMockDropEvent(dataTransfer);

    const handled = handleArtifactDrop(
      view as unknown as EditorView,
      event as unknown as DragEvent,
    );

    expect(handled).toBe(true);
    expect(view.state.schema.nodeFromJSON).toHaveBeenCalledWith({
      type: "resizeNode",
      content: [{ type: "cardEmbed", attrs: { id: 22 } }],
    });
    // dropped at the top-level boundary ($pos.after(1) === 8)
    expect(transaction.insert).toHaveBeenCalledWith(8, node);
    expect(dispatch).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("ignores drops without an artifact payload", () => {
    const dataTransfer = createMockDataTransfer();
    dataTransfer.setData("text/plain", "hello");
    const { view, dispatch } = createMockView();
    const event = createMockDropEvent(dataTransfer);

    const handled = handleArtifactDrop(
      view as unknown as EditorView,
      event as unknown as DragEvent,
    );

    expect(handled).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dataTransfer.types).not.toContain(ARTIFACT_DND_MIME);
  });
});
