import {
  type VirtualElement,
  autoUpdate,
  computePosition,
  flip,
  shift,
  size,
} from "@floating-ui/dom";
import { type Editor, Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";

import { EmojiPicker } from "metabase/common/components/EmojiPicker";

export interface EmojiSuggestionOptions {
  suggestion: Partial<SuggestionOptions>;
}

export const EmojiSuggestionPluginKey = new PluginKey("emojiSuggestion");

// TipTap extension to show EmojiPicker when typing :xx
export const EmojiSuggestionExtension =
  Extension.create<EmojiSuggestionOptions>({
    name: "emojiSuggestion",

    addStorage() {
      return {
        isEmojiPopupOpen: false,
      };
    },

    addOptions() {
      return {
        suggestion: {
          char: ":",
          pluginKey: EmojiSuggestionPluginKey,
          allowSpaces: false,
          // Only allow when at least 1 char was typed after ':'
          allow: ({ state, range }) => {
            const text = state.doc.textBetween(range.from, range.to);
            // Expect text like ":sm", so strip the leading ":" and measure the rest
            const maybeQuery = text.startsWith(":") ? text.slice(1) : text;
            return maybeQuery.length >= 1;
          },
          // We don't use items rendering from Suggestion; EmojiPicker handles filtering.
          items: () => [],
          render: renderEmojiPicker,
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: Range;
            props: { emoji?: string };
          }) => {
            const emoji = (props as any)?.emoji as string | undefined;
            if (!emoji) {
              return;
            }
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(emoji + " ")
              .run();
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });

function renderEmojiPicker() {
  let component: ReactRenderer<any>;
  let popup: HTMLElement;
  let cleanup: (() => void) | undefined;
  const handlers = new WeakMap();

  /**
   * The implementation of frimousse emoji picker requires it's built-in
   * search input to be focused to properly support keyboard navigation.
   * But because the suggestion popup is rendered outside of the editor,
   * pressing Tab once doesn't set focus on the right element.
   *
   * To work around this, we listen to global keydown events and focus
   * the search input when Tab is pressed.
   *
   * Also, it's not possible to pick first available emoji with 'Enter' key press
   * until the search input is focused, so this case is also handled manually.
   */
  function getSearchInput() {
    return popup.querySelector("input");
  }

  function getGlobalPopupKeyHandler(props: SuggestionProps) {
    return function (e: KeyboardEvent) {
      /**
       * This workaround allows to start popup navigation without explicitly pressing
       * Tab to focus search input first. It works as intended when user has already
       * entered 2+ symbols and internal filtering has been triggered.
       * Unfortunately, if user has entered only 1 symbol, like ':a', 2 arrow presses
       * would be required, because the first one only focuses first available emoji
       * in that case (initiating navigation is restricted by 'frimousse's internal
       * logic, depending on "interaction" type).
       */
      if (
        e.key.includes("Arrow") &&
        !document.activeElement?.matches("input")
      ) {
        const input = getSearchInput();
        if (input) {
          input.focus();
          input.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }));
        }
      }

      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();

        // This covers 2 scenarios:
        // 1. autocomplete for 1st available emoji
        // 2. selecting one with arrow keys
        // We cover both cases here "manually", because otherwise editor inserts new line
        // if we don't capture the event.
        const activeEmojiElement =
          popup.querySelector("[data-active]") ||
          popup.querySelector(
            '[frimousse-row][aria-rowindex="0"] [data-emoji]',
          );

        const emoji = activeEmojiElement?.getAttribute("data-emoji");

        props.command({ emoji });
        return;
      }

      // Close Emoji popup on Esc
      if (e.key === "Escape") {
        e.stopPropagation();
        document.removeEventListener("keydown", handlers.get(popup), {
          capture: true,
        });
        handlers.delete(popup);
        popup.remove();
        component.destroy();
        return false;
      }
    };
  }

  return {
    onStart: (props: SuggestionProps) => {
      // Mark popup open
      setEmojiPopupOpen(props.editor, true);

      component = new ReactRenderer(EmojiPicker, {
        props: getEmojiPickerProps(props),
        editor: props.editor,
      });

      popup = document.createElement("div");
      popup.style.position = "absolute";
      popup.style.zIndex = "9999";
      document.body.appendChild(popup);

      if (component.element) {
        popup.appendChild(component.element);
      }

      const handler = getGlobalPopupKeyHandler(props);
      document.addEventListener("keydown", handler, { capture: true });
      handlers.set(popup, handler);

      const virtualElement = getCaretVirtualElement(props.editor);
      cleanup = startAutoPositioning(virtualElement, popup);
    },

    onUpdate: (props: SuggestionProps) => {
      component.updateProps(getEmojiPickerProps(props));

      document.removeEventListener("keydown", handlers.get(popup), {
        capture: true,
      });
      const updateHandler = getGlobalPopupKeyHandler(props);
      document.addEventListener("keydown", updateHandler, { capture: true });
      handlers.set(popup, updateHandler);

      const virtualElement = getCaretVirtualElement(props.editor);
      updatePositionOnce(virtualElement, popup);
    },

    onKeyDown: (props: SuggestionKeyDownProps) => {
      // Prevent default behavior of Esc key to close popup, but keep focus inside the input.
      if (props.event.key === "Escape" && handlers.has(popup)) {
        props.event.stopImmediatePropagation();
        return true;
      }
      return component.ref?.onKeyDown(props) || false;
    },

    onExit: (props: SuggestionProps) => {
      // Mark popup closed
      setEmojiPopupOpen(props.editor, false);

      if (cleanup) {
        cleanup();
      }
      document.removeEventListener("keydown", handlers.get(popup), {
        capture: true,
      });
      if (popup && popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
      component.destroy();
    },
  };
}

// Helpers
function setEmojiPopupOpen(editor: Editor, isOpen: boolean) {
  try {
    const storage = (editor.storage as any).emojiSuggestion;
    if (storage) {
      storage.isEmojiPopupOpen = isOpen;
    }
  } catch {}
}

function getCaretVirtualElement(editor: Editor): VirtualElement {
  return {
    getBoundingClientRect: () => {
      const { view, state } = editor;
      const { from } = state.selection;
      const coordinates = view.coordsAtPos(from);

      return {
        x: coordinates.left,
        y: coordinates.top,
        width: 0,
        height: coordinates.bottom - coordinates.top,
        top: coordinates.top,
        right: coordinates.left,
        bottom: coordinates.bottom,
        left: coordinates.left,
      } as DOMRect;
    },
  };
}

function startAutoPositioning(
  virtualElement: VirtualElement,
  popup: HTMLElement,
) {
  return autoUpdate(virtualElement, popup, () => {
    computePosition(virtualElement, popup, {
      placement: "bottom-start",
      middleware: [
        flip(),
        shift({ padding: 5 }),
        size({
          apply({ availableHeight }) {
            Object.assign(popup.style, {
              maxHeight: `${Math.min(400, availableHeight)}px`,
            });
          },
        }),
      ],
    }).then(({ x, y }) => {
      Object.assign(popup.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  });
}

function updatePositionOnce(
  virtualElement: VirtualElement,
  popup: HTMLElement,
) {
  computePosition(virtualElement, popup, {
    placement: "bottom-start",
    middleware: [
      flip(),
      shift({ padding: 5 }),
      size({
        apply({ availableHeight }) {
          Object.assign(popup.style, {
            maxHeight: `${Math.min(400, availableHeight)}px`,
          });
        },
      }),
    ],
  }).then(({ x, y }) => {
    Object.assign(popup.style, {
      left: `${x}px`,
      top: `${y}px`,
    });
  });
}

function getEmojiPickerProps(props: SuggestionProps) {
  return {
    search: props.query,
    hideSearch: true,
    onEmojiSelect: (emoji: { emoji: string }) => {
      props.command({ emoji: emoji.emoji });
    },
  };
}
