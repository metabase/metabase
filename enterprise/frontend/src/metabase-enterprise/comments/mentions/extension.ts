import {
  type VirtualElement,
  autoUpdate,
  computePosition,
  flip,
  shift,
  size,
} from "@floating-ui/dom";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";

import { userApi } from "metabase/api";
import type { DispatchFn } from "metabase/lib/redux";
import type { User } from "metabase-types/api";

import {
  MentionList,
  type MentionListProps,
  type MentionListRef,
} from "./MentionList";
import S from "./mentions.module.css";

type ExtensionProps = {
  currentUser?: User | null;
  dispatch: DispatchFn;
};

export const configureMentionExtension = ({
  currentUser,
  dispatch,
}: ExtensionProps) =>
  Mention.configure({
    HTMLAttributes: { class: S.mention },
    suggestion: {
      char: "@",
      allowSpaces: true,
      items: async ({ query }) => {
        const result = await dispatch(
          userApi.endpoints.listUsers.initiate({ query }),
        );
        if (!result.data) {
          return [];
        }
        return result.data.data
          .map((user) => ({
            id: user.id,
            label: user.common_name,
          }))
          .filter((user) => user.id !== currentUser?.id);
      },
      render: renderMentionList,
    },
  });

const renderMentionList = () => {
  let component: ReactRenderer<MentionListRef, MentionListProps>;
  let popup: HTMLElement;
  let cleanup: (() => void) | undefined;

  return {
    onStart: (props: SuggestionProps) => {
      component = new ReactRenderer(MentionList, {
        props,
        editor: props.editor,
      });

      popup = document.createElement("div");
      popup.style.position = "absolute";
      popup.style.zIndex = "9999";
      document.body.appendChild(popup);

      if (component.element) {
        popup.appendChild(component.element);
      }

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

      cleanup = autoUpdate(virtualElement, popup, () => {
        computePosition(virtualElement, popup, {
          placement: "bottom-start",
          middleware: [
            flip(),
            shift({ padding: 5 }),
            size({
              apply({ availableHeight }) {
                Object.assign(popup.style, {
                  maxHeight: `${Math.min(200, availableHeight)}px`,
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
                maxHeight: `${Math.min(200, availableHeight)}px`,
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

    onExit: () => {
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
