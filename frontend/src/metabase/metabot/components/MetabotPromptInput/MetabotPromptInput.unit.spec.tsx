import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EditorState } from "@tiptap/pm/state";
import fetchMock from "fetch-mock";
import { createRef } from "react";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { createMockState } from "metabase/redux/store/mocks";
import { MetabotMentionPluginKey } from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
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
  // The TipTap/ProseMirror editor and its mention popover process input
  // through real timers/microtasks; the fast-test regime's frozen fake timers
  // prevent typed characters from reaching the editor state. Opt this file
  // back into real timers, and use an inter-event delay of 0 (rather than the
  // regime's `delay: null`) so ProseMirror gets a chance to process each key.
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(() => {
    jest.useRealTimers();
    user = userEvent.setup({ delay: 0 });
  });

  it("should not call onSubmit when mention popover is open", async () => {
    const onSubmit = jest.fn();
    setup({ onSubmit });

    await user.type(getEditor(), "@");
    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("should not call onStop on escape while mention popover is open", async () => {
    const onStop = jest.fn();
    setup({ onStop });

    await user.type(getEditor(), "@");
    await user.keyboard("{Escape}");

    expect(onStop).not.toHaveBeenCalled();
  });

  it("should call onStop on escape when mention popover is not open", async () => {
    const onStop = jest.fn();
    setup({ onStop });

    await user.type(getEditor(), "hi");
    await user.keyboard("{Escape}");

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("should open the mention popup if @ is typed", async () => {
    const ref = createRef<MetabotPromptInputRef>();
    setup({ ref });

    await user.type(getEditor(), "@");

    // Unjustified type cast. FIXME
    const editor = ref.current as { view: { state: EditorState } } | null;
    expect(editor).toBeTruthy();
    const mentionState = MetabotMentionPluginKey.getState(editor!.view.state);
    expect(mentionState?.active).toBe(true);
  });

  it("should close mention popup if {escape} is pressed", async () => {
    setup();

    await user.type(getEditor(), "@");

    expect(await screen.findByTestId("mini-picker")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument();
    });
  });

  it("should scope mention search to the currently selected database after a database change", async () => {
    const suggestionModels: SuggestionModel[] = ["table"];

    const typeMentionQueryAndGetSearchDbId = async () => {
      await user.type(getEditor(), "@ord");
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

    await user.keyboard("{Escape}");
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
