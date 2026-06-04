import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { createRef } from "react";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/collections/constants";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { createMockState } from "metabase/redux/store/mocks";
import { MetabotMentionPluginKey } from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  createMockCollection,
  createMockDatabase,
} from "metabase-types/api/mocks";

import {
  ARTIFACT_DND_MIME,
  setArtifactDragData,
} from "../MetabotBar/artifactDragData";

import {
  MetabotPromptInput,
  handleArtifactMentionDrop,
} from "./MetabotPromptInput";

const defaultProps = {
  value: "",
  disabled: false,
  onChange: jest.fn(),
  onStop: jest.fn(),
  suggestionConfig: {
    suggestionModels: ["table", "database"] as SuggestionModel[],
  },
};

const setup = (props = {}) => {
  const settings = mockSettings({ "site-url": "http://localhost:3000" });
  const rootCollection = createMockCollection(ROOT_COLLECTION);

  setupDatabasesEndpoints([createMockDatabase({ id: 1, name: "DB 1" })]);
  setupCollectionByIdEndpoint({
    collections: [rootCollection],
  });

  return renderWithProviders(
    <MetabotPromptInput {...defaultProps} {...props} autoFocus />,
    {
      storeInitialState: createMockState({ settings }),
    },
  );
};

const getEditor = () => screen.getByRole("textbox");

describe("MetabotPromptInput", () => {
  it("should not call onSubmit when mention popover is open", async () => {
    const onSubmit = jest.fn();
    setup({ onSubmit });

    await userEvent.type(getEditor(), "@");
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should not call onStop on escape while mention popover is open", async () => {
    const onStop = jest.fn();
    setup({ onStop });

    await userEvent.type(getEditor(), "@");
    await userEvent.keyboard("{Escape}");

    expect(onStop).not.toHaveBeenCalled();
  });

  it("should call onStop on escape when mention popover is not open", async () => {
    const onStop = jest.fn();
    setup({ onStop });

    await userEvent.type(getEditor(), "hi");
    await userEvent.keyboard("{Escape}");

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("should open the mention popup if @ is typed", async () => {
    const ref = createRef<MetabotPromptInputRef>();
    setup({ ref });

    await userEvent.type(getEditor(), "@");

    const editor = ref.current as { view: { state: EditorState } } | null;
    expect(editor).toBeTruthy();
    const mentionState = MetabotMentionPluginKey.getState(editor!.view.state);
    expect(mentionState?.active).toBe(true);
  });

  it("should close mention popup if {escape} is pressed", async () => {
    setup();

    await userEvent.type(getEditor(), "@");

    expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument();
    });
  });
});

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

function createMockDropEvent(dataTransfer: DataTransfer) {
  return {
    dataTransfer,
    clientX: 10,
    clientY: 20,
    preventDefault: jest.fn(),
  };
}

describe("handleArtifactMentionDrop", () => {
  // run against the real editor so the prosemirror schema/transaction is genuine
  const setupView = () => {
    const ref = createRef<MetabotPromptInputRef>();
    setup({ ref });
    const view = (ref.current as unknown as { view: EditorView }).view;
    return view;
  };

  it("inserts a card smartLink mention and claims the drop", () => {
    const view = setupView();
    const dataTransfer = createMockDataTransfer();
    setArtifactDragData(dataTransfer, { model: "card", id: 22 });
    const event = createMockDropEvent(dataTransfer);

    const handled = handleArtifactMentionDrop(
      view,
      event as unknown as DragEvent,
    );

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();

    let mention: { attrs: Record<string, unknown> } | undefined;
    view.state.doc.descendants((node) => {
      if (node.type.name === "smartLink") {
        mention = node as unknown as { attrs: Record<string, unknown> };
      }
    });
    expect(mention?.attrs).toMatchObject({ entityId: 22, model: "card" });
  });

  it("ignores drops without an artifact payload", () => {
    const view = setupView();
    const dataTransfer = createMockDataTransfer();
    dataTransfer.setData("text/plain", "hello");
    const event = createMockDropEvent(dataTransfer);

    const handled = handleArtifactMentionDrop(
      view,
      event as unknown as DragEvent,
    );

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dataTransfer.types).not.toContain(ARTIFACT_DND_MIME);
    view.state.doc.descendants((node) => {
      expect(node.type.name).not.toBe("smartLink");
    });
  });
});
