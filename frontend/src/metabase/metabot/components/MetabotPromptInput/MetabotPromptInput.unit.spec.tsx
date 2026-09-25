import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import fetchMock from "fetch-mock";
import { createRef } from "react";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotMentionPluginKey } from "metabase/metabot/components/editor-extensions/MetabotMention/MetabotMentionExtension";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  createMockCollection,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { MetabotPromptInput } from "./MetabotPromptInput";

const defaultProps = {
  value: "",
  disabled: false,
  onChange: jest.fn(),
  onStop: jest.fn(),
  suggestionConfig: {
    // Unjustified type cast. FIXME
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
  setupSearchEndpoints([]);

  return renderWithProviders(
    <MetabotPromptInput {...defaultProps} {...props} autoFocus />,
    {
      storeInitialState: createMockState({ settings }),
    },
  );
};

const getEditor = () => screen.getByRole("textbox");

describe("MetabotPromptInput", () => {
  it("submits the suggested prompt once on Tab without inserting a draft", () => {
    const onSubmit = jest.fn<void, [prompt?: string], void>();
    setup({ suggestedPrompt: "Show the trend", onSubmit });

    fireEvent.keyDown(getEditor(), { key: "Tab" });
    fireEvent.keyDown(getEditor(), { key: "Tab" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Show the trend");
    expect(getEditor()).toHaveTextContent(/^$/);
  });

  it.each([{ value: "A draft" }, { value: " " }, { disabled: true }])(
    "does not accept suggestions when the input is unavailable: %j",
    (props) => {
      const onSubmit = jest.fn<void, [prompt?: string], void>();
      setup({ suggestedPrompt: "Show the trend", onSubmit, ...props });
      fireEvent.keyDown(getEditor(), { key: "Tab" });
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it.each([
    { shiftKey: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { isComposing: true },
    { repeat: true },
  ])(
    "does not submit with modified, composing, or repeated Tab: %j",
    (modifiers) => {
      const onSubmit = jest.fn<void, [prompt?: string], void>();
      setup({ suggestedPrompt: "Show the trend", onSubmit });
      fireEvent.keyDown(getEditor(), { key: "Tab", ...modifiers });
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it("navigates suggestions only from an empty input", async () => {
    const onNavigateSuggestions = jest.fn<
      void,
      [direction: "up" | "down"],
      void
    >();
    setup({ onNavigateSuggestions });
    fireEvent.keyDown(getEditor(), { key: "ArrowUp" });
    fireEvent.keyDown(getEditor(), { key: "ArrowDown" });
    expect(onNavigateSuggestions.mock.calls).toEqual([["up"], ["down"]]);
    await userEvent.type(getEditor(), "A draft");
    fireEvent.keyDown(getEditor(), { key: "ArrowUp" });
    expect(onNavigateSuggestions).toHaveBeenCalledTimes(2);
  });

  it("updates the placeholder without replacing the editor or losing a draft", async () => {
    const ref = createRef<MetabotPromptInputRef>();
    const { rerender } = setup({ ref });
    const editor = ref.current;
    await userEvent.type(getEditor(), "My draft");
    rerender(
      <MetabotPromptInput
        {...defaultProps}
        ref={ref}
        placeholder="A new placeholder"
      />,
    );
    expect(ref.current).toBe(editor);
    expect(ref.current?.getValue?.()).toBe("My draft");
    expect(getEditor()).toHaveFocus();
  });

  it("clears an externally submitted draft without echoing it back through onChange", async () => {
    const onChange = jest.fn<void, [value: string], void>();
    const { rerender } = setup({ value: "Show sales", onChange });
    rerender(
      <MetabotPromptInput {...defaultProps} value="" onChange={onChange} />,
    );
    await waitFor(() => expect(getEditor()).toHaveTextContent(/^$/));
    expect(onChange).not.toHaveBeenCalled();
    rerender(
      <MetabotPromptInput
        {...defaultProps}
        value="Show sales"
        onChange={onChange}
      />,
    );
    expect(getEditor()).toHaveTextContent("Show sales");
    rerender(
      <MetabotPromptInput {...defaultProps} value="" onChange={onChange} />,
    );
    expect(getEditor()).toHaveTextContent(/^$/);
  });

  it("does not accept a suggestion over typed whitespace", async () => {
    const onSubmit = jest.fn<void, [prompt?: string], void>();
    setup({ suggestedPrompt: "Show the trend", onSubmit });
    await userEvent.type(getEditor(), " ");
    fireEvent.keyDown(getEditor(), { key: "Tab" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

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

    // Unjustified type cast. FIXME
    const editor = ref.current as { view: { state: EditorState } } | null;
    expect(editor).toBeTruthy();
    const mentionState = MetabotMentionPluginKey.getState(editor!.view.state);
    expect(mentionState?.active).toBe(true);
  });

  it("places the caret at the end of a prompt seeded on mount", async () => {
    const ref = createRef<MetabotPromptInputRef>();
    setup({ ref, value: "Create a transform that " });

    // The imperative handle is `Object.assign(editor, …)`, so `ref.current` is the
    // underlying tiptap Editor at runtime; the public ref type just narrows it.
    const editor = ref.current as unknown as Editor;
    await waitFor(() => {
      const { selection, doc } = editor.state;
      expect(selection.empty).toBe(true);
      expect(selection.from).toBe(doc.content.size - 1);
    });
  });

  it("moves the caret to the end when the value is changed externally", async () => {
    const ref = createRef<MetabotPromptInputRef>();
    const { rerender } = setup({ ref, value: "" });

    rerender(
      <MetabotPromptInput
        {...defaultProps}
        ref={ref}
        value="Create a transform that "
        autoFocus
      />,
    );

    // The imperative handle is `Object.assign(editor, …)`, so `ref.current` is the
    // underlying tiptap Editor at runtime; the public ref type just narrows it.
    const editor = ref.current as unknown as Editor;
    await waitFor(() => {
      const { selection, doc } = editor.state;
      expect(selection.from).toBe(doc.content.size - 1);
    });
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

  it("should scope mention search to the currently selected database after a database change", async () => {
    const suggestionModels: SuggestionModel[] = ["table"];

    const typeMentionQueryAndGetSearchDbId = async () => {
      await userEvent.type(getEditor(), "@ord");
      await waitFor(() => {
        expect(fetchMock.callHistory.lastCall("path:/api/search")).toBeTruthy();
      });
      const lastCall = fetchMock.callHistory.lastCall("path:/api/search");
      return new URL(lastCall!.url).searchParams.get("table_db_id");
    };

    const { rerender } = setup({
      suggestionConfig: { suggestionModels, onlyDatabaseId: 1 },
    });

    expect(await typeMentionQueryAndGetSearchDbId()).toBe("1");

    await userEvent.keyboard("{Escape}");
    fetchMock.clearHistory();

    rerender(
      <MetabotPromptInput
        {...defaultProps}
        suggestionConfig={{ suggestionModels, onlyDatabaseId: 2 }}
        autoFocus
      />,
    );

    expect(await typeMentionQueryAndGetSearchDbId()).toBe("2");
  });
});
