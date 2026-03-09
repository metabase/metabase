import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { createRef } from "react";
import { act } from "react-dom/test-utils";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { EntityPickerModalProps } from "metabase/common/components/Pickers";
import type { OmniPickerItem } from "metabase/common/components/Pickers/EntityPicker/types";
import type { MiniPickerProps } from "metabase/common/components/Pickers/MiniPicker/components/MiniPicker/MiniPicker";
import type { MiniPickerPickableItem } from "metabase/common/components/Pickers/MiniPicker/types";
import type { BareSuggestionRendererRef } from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";

import type { MetabotMentionSuggestionProps } from "./MetabotSuggestionNew";
import { MetabotMentionSuggestionNew } from "./MetabotSuggestionNew";

jest.mock("metabase/common/components/Pickers", () => {
  return {
    MiniPicker: (props: MiniPickerProps) => {
      const miniItem: MiniPickerPickableItem = {
        id: 1,
        model: "card",
        name: "Mini card",
      };

      return (
        <div data-testid="mini-picker">
          <button onClick={() => props.onChange(miniItem)}>mini-select</button>
          <button onClick={() => props.onBrowseAll?.()}>browse-all</button>
          {props.children}
        </div>
      );
    },
    EntityPickerModal: (props: EntityPickerModalProps) => {
      const modalItem: OmniPickerItem = {
        id: 2,
        model: "dashboard",
        name: "Modal dashboard",
      };

      return (
        <div data-testid="entity-picker-modal">
          <button onClick={() => props.onChange(modalItem)}>
            modal-select
          </button>
          <button onClick={props.onClose}>modal-close</button>
        </div>
      );
    },
  };
});

const setup = (props: Partial<MetabotMentionSuggestionProps> = {}) => {
  const command = jest.fn();
  const onClose = jest.fn();
  const ref = createRef<BareSuggestionRendererRef>();
  const focusMock = jest.fn();
  const editor = {
    commands: {
      focus: focusMock,
    },
    view: {
      dom: document.createElement("div"),
    },
  } as unknown as Editor;

  const defaultProps: MetabotMentionSuggestionProps = {
    items: [],
    command,
    editor,
    range: { from: 1, to: 1 },
    query: "ord",
    text: "@ord",
    onClose,
    decorationNode: null,
    clientRect: null,
    ...props,
  };

  renderWithProviders(
    <MetabotMentionSuggestionNew {...defaultProps} ref={ref} />,
  );

  return { command, onClose, editor, ref, focusMock };
};

describe("MetabotMentionSuggestionNew", () => {
  it("selecting mini picker item calls command with mention payload", async () => {
    const { command } = setup();

    await userEvent.click(screen.getByRole("button", { name: "mini-select" }));

    expect(command).toHaveBeenCalledWith({
      id: 1,
      model: "card",
      label: "Mini card",
    });
  });

  it("selecting browse-all modal item calls command and closes suggestion", async () => {
    const { command, onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "browse-all" }));
    expect(
      await screen.findByTestId("entity-picker-modal"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "modal-select" }));

    expect(command).toHaveBeenCalledWith({
      id: 2,
      model: "dashboard",
      label: "Modal dashboard",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closing browse-all modal hides EntityPickerModal but not the mini picker", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "browse-all" }));
    expect(
      await screen.findByTestId("entity-picker-modal"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "modal-close" }));

    await waitFor(() => {
      expect(
        screen.queryByTestId("entity-picker-modal"),
      ).not.toBeInTheDocument();
    });

    expect(
      await screen.findByRole("button", { name: "mini-select" }),
    ).toBeInTheDocument();
  });

  it("pressing Escape closes suggestion when focus is on field", () => {
    const { onClose, ref } = setup();
    let handled: boolean | undefined;

    act(() => {
      handled = ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Escape" }),
      });
    });

    expect(handled).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});
