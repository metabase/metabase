import { Editor, type JSONContent } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { NodeSelection } from "@tiptap/pm/state";

import { act, fireEvent, renderHook } from "__support__/ui";
import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";

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
  updateAnalysisNodeSettings,
} from "./analysis-node-utils";
import { AnalysisDocumentAttributes } from "./document-context";
import { useAnalysisDocumentState } from "./use-analysis-document-state";

const FUNNEL: ProductAnalyticsNodeDefinition = {
  version: 1,
  kind: "funnel",
  settings: {},
};
const PATHS: ProductAnalyticsNodeDefinition = {
  version: 1,
  kind: "paths",
  settings: {},
};

type SetupOpts = {
  canWrite?: boolean;
};

const setup = ({ canWrite = true }: SetupOpts = {}) => {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const content: JSONContent = {
    type: "doc",
    content: [
      createAnalysisNodeContent(FUNNEL, "a"),
      { type: "paragraph", content: [{ type: "text", text: "Notes" }] },
      createAnalysisNodeContent(FUNNEL, "b"),
    ],
  };
  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      AnalysisDocumentAttributes,
      AnalysisNode,
    ],
    content,
  });
  const { result } = renderHook(() =>
    useAnalysisDocumentState({
      editor,
      tableId: 1,
      dateRange: "past30days",
      canWrite,
    }),
  );

  const selectAnalysis = (nodeId: string) => {
    const found = findAnalysisNode(editor.state.doc, nodeId);
    if (found === undefined) {
      throw new Error(`No analysis ${nodeId}`);
    }
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, found.pos),
        ),
      );
    });
  };
  const getAnalysisIds = () => {
    const ids: string[] = [];
    editor.state.doc.forEach((node) => {
      const id = getAnalysisNodeId(node);
      if (node.type.name === AnalysisNode.name && id !== undefined) {
        ids.push(id);
      }
    });
    return ids;
  };

  return { editor, result, selectAnalysis, getAnalysisIds };
};

describe("useAnalysisDocumentState", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the panel tab it's asked to when edit mode starts", () => {
    const { result } = setup();

    act(() => result.current.startEditing("a", "insights"));

    expect(result.current.editingNodeId).toBe("a");
    expect(result.current.panelTab).toBe("insights");
  });

  it("opens insights narrowed to a transition, until the tab or the analysis changes", () => {
    const { result } = setup();

    act(() => result.current.showInsights("a", 2));
    expect(result.current.editingNodeId).toBe("a");
    expect(result.current.panelTab).toBe("insights");
    expect(result.current.insightsTransition).toBe(2);

    act(() => result.current.setPanelTab("setup"));
    expect(result.current.insightsTransition).toBeNull();

    act(() => result.current.showInsights("a", 1));
    act(() => result.current.startEditing("b"));
    expect(result.current.panelTab).toBe("insights");
    expect(result.current.insightsTransition).toBeNull();
  });

  it("widens narrowed insights back to all of them", () => {
    const { result } = setup();
    act(() => result.current.showInsights("a", 2));

    act(() => result.current.showInsights("a"));

    expect(result.current.panelTab).toBe("insights");
    expect(result.current.insightsTransition).toBeNull();
  });

  it("keeps edit mode while the analysis is selected or its settings change", () => {
    const { editor, result, selectAnalysis } = setup();
    act(() => result.current.startEditing("a"));

    selectAnalysis("a");
    act(() => updateAnalysisNodeSettings(editor, "a", { counting: "event" }));

    expect(result.current.editingNodeId).toBe("a");
  });

  it("leaves edit mode when the selection moves into text", () => {
    const { editor, result, selectAnalysis } = setup();
    selectAnalysis("a");
    act(() => result.current.startEditing("a"));

    act(() => {
      const paragraphStart = editor.state.doc.child(0).nodeSize + 1;
      editor.commands.setTextSelection(paragraphStart);
    });

    expect(result.current.editingNodeId).toBeNull();
  });

  it("leaves edit mode when another analysis is selected", () => {
    const { result, selectAnalysis } = setup();
    act(() => result.current.startEditing("a"));

    selectAnalysis("b");

    expect(result.current.editingNodeId).toBeNull();
  });

  it("leaves edit mode on Escape in the document, but not elsewhere", () => {
    const { editor, result } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => result.current.startEditing("a"));

    fireEvent.keyDown(input, { key: "Escape" });
    expect(result.current.editingNodeId).toBe("a");

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(result.current.editingNodeId).toBeNull();
  });

  it("adds analyses below their source in the order they were added", () => {
    const { result, getAnalysisIds } = setup();

    act(() => result.current.insertAnalysisBelow("a", PATHS));
    const first = result.current.highlightedNodeId;
    act(() => result.current.insertAnalysisBelow("a", PATHS));
    const second = result.current.highlightedNodeId;

    expect(getAnalysisIds()).toEqual(["a", first, second, "b"]);
  });

  it("adds a new analysis on an empty line in edit mode, with its setup open", () => {
    const { editor, result, getAnalysisIds } = setup();
    act(() => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createAnalysisNodeContent(FUNNEL, "a"),
          { type: "paragraph" },
        ],
      });
      editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 1);
    });

    act(() => result.current.insertAnalysis("habit"));

    expect(getAnalysisIds()).toEqual(["a", result.current.editingNodeId]);
    expect(editor.state.doc.childCount).toBe(2);
    expect(result.current.panelTab).toBe("setup");
  });

  it("adds a new analysis after the selected one instead of replacing it", () => {
    const { result, selectAnalysis, getAnalysisIds } = setup();
    selectAnalysis("a");

    act(() => result.current.insertAnalysis("habit"));

    expect(getAnalysisIds()).toEqual(["a", result.current.editingNodeId, "b"]);
  });

  it("doesn't add analyses without write access", () => {
    const { result, getAnalysisIds } = setup({ canWrite: false });

    act(() => result.current.insertAnalysis("habit"));
    act(() => result.current.insertAnalysisBelow("a", PATHS));

    expect(getAnalysisIds()).toEqual(["a", "b"]);
  });
});
