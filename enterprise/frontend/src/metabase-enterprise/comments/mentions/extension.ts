import {
  type VirtualElement,
  autoUpdate,
  computePosition,
  flip,
  shift,
  size,
} from "@floating-ui/dom";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";

import { searchApi, userApi } from "metabase/api";
import type { DispatchFn } from "metabase/lib/redux";

import { isCommentsStorage } from "../types";

import { CustomMentionExtension } from "./CustomMentionExtension";
import {
  MentionList,
  type MentionListProps,
  type MentionListRef,
} from "./MentionList";

type ExtensionProps = {
  dispatch: DispatchFn;
};

export const configureMentionExtension = ({ dispatch }: ExtensionProps) =>
  CustomMentionExtension.configure({
    suggestion: {
      char: "@",
      allowSpaces: false,
      allow: ({ state, range }) => {
        const textAfter = state.doc.textBetween(range.from, range.to);

        // allows adding @ symbol without showing mention list
        return !textAfter.includes(" ");
      },
      items: async ({ query }) => {
        const [userResult, searchResult] = await Promise.all([
          dispatch(userApi.endpoints.listUsers.initiate({ query })),
          dispatch(
            searchApi.endpoints.search.initiate({
              q: query,
              filter_items_in_personal_collection: "exclude",
              models: ["card", "dashboard", "dataset", "metric"],
              limit: 10,
            }),
          ),
        ]);

        const items = [];

        if (userResult.data) {
          const users = userResult.data.data
            .map((user) => ({
              id: `user:${user.id}`,
              entityId: user.id,
              label: user.common_name,
              type: "user" as const,
            }))
            .slice(0, 5);

          items.push(...users);
        }

        if (searchResult.data) {
          const searchItems = searchResult.data.data
            .slice(0, 5)
            .map((item) => ({
              id: `${item.model}:${item.id}`,
              entityId: item.id,
              label: item.name,
              type: item.model,
              collection: item.collection?.name,
            }));

          items.push(...searchItems);
        }

        return items;
      },
      render: renderMentionList,
      command: ({ editor, range, props }) => {
        const item = props as any;

        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "mention",
            attrs: {
              id: String(item.entityId),
              label: item.label,
              model: item.type,
            },
          })
          .insertContent(" ")
          .run();
      },
    },
  });

const renderMentionList = () => {
  let component: ReactRenderer<MentionListRef, MentionListProps>;
  let popup: HTMLElement;
  let cleanup: (() => void) | undefined;

  return {
    onStart: (props: SuggestionProps) => {
      const { editor } = props;

      component = new ReactRenderer(MentionList, { props, editor });

      const mentionStorage = isCommentsStorage(editor.storage)
        ? editor.storage.mention
        : undefined;

      if (mentionStorage) {
        mentionStorage.isMentionPopupOpen = true;
      }

      popup = document.createElement("div");
      popup.style.position = "absolute";
      popup.style.zIndex = "9999";
      document.body.appendChild(popup);

      if (component.element) {
        popup.appendChild(component.element);
      }

      const virtualElement: VirtualElement = {
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
          };
        },
      };

      cleanup = autoUpdate(virtualElement, popup, () => {
        computePosition(virtualElement, popup, {
          placement: "bottom-start",
          middleware: [
            flip(),
            shift({ padding: 5 }),
            size({
              apply({ availableHeight }) {
                Object.assign(popup.style, {
                  maxHeight: `${Math.min(400, availableHeight)}px`,
                  minWidth: "320px",
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
    },

    onUpdate: (props: SuggestionProps) => {
      component.updateProps(props);

      const virtualElement: VirtualElement = {
        getBoundingClientRect: () => {
          const { view, state } = props.editor;
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
          };
        },
      };

      computePosition(virtualElement, popup, {
        placement: "bottom-start",
        middleware: [
          flip(),
          shift({ padding: 5 }),
          size({
            apply({ availableHeight }) {
              Object.assign(popup.style, {
                maxHeight: `${Math.min(400, availableHeight)}px`,
                minWidth: "320px",
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
    },

    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === "Escape") {
        props.event.stopPropagation();
        return true;
      }
      return component.ref?.onKeyDown(props) || false;
    },

    onExit: (props: SuggestionProps) => {
      // Mark mention popup as closed in extension storage
      try {
        const storage = (props.editor.storage as any).mention;
        if (storage) {
          storage.isMentionPopupOpen = false;
        }
      } catch {}
      if (cleanup) {
        cleanup();
      }
      if (popup && popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
      component.destroy();
    },
  };
};
