import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EditorState } from "@tiptap/pm/state";
import { createRef } from "react";

import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { MetabotMentionPluginKey } from "metabase/rich_text_editing/tiptap/extensions/MetabotMention/MetabotMentionExtension";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { createMockState } from "metabase-types/store/mocks";

import { MetabotPromptInput } from "./MetabotPromptInput";

jest.mock(
  "metabase/rich_text_editing/tiptap/extensions/Mention/MentionSuggestion",
  () => ({
    createMentionSuggestion: () =>
      function MockMentionSuggestion() {
        return <div aria-label="Mention Dialog" role="dialog" />;
      },
  }),
);

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

    expect(await screen.findByLabelText("Mention Dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByLabelText("Mention Dialog")).not.toBeInTheDocument();
    });
  });
});
