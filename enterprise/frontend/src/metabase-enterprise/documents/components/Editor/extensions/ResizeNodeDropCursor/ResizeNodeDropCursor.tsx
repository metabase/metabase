import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface ResizeNodeDropCursorOptions {
  /**
   * CSS class for the drop cursor
   * @default 'resize-node-drop-cursor'
   */
  class: string;

  /**
   * Width of the drop cursor line
   * @default '2px'
   */
  width: string;

  /**
   * Color of the drop cursor
   * @default 'var(--mb-color-brand)'
   */
  color: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resizeNodeDropCursor: {
      /**
       * Show drop cursor at position
       */
      showResizeNodeDropCursor: (pos: number) => ReturnType;
      /**
       * Hide drop cursor
       */
      hideResizeNodeDropCursor: () => ReturnType;
    };
  }
}

/**
 * ResizeNodeDropCursor Extension
 *
 * Shows a visual drop cursor when dragging ResizeNode over other ResizeNodes.
 * Provides precise visual feedback for drop positioning.
 */
export const ResizeNodeDropCursor =
  Extension.create<ResizeNodeDropCursorOptions>({
    name: "resizeNodeDropCursor",

    addOptions() {
      return {
        class: "resize-node-drop-cursor",
        width: "6px",
        color: "var(--mb-color-brand)",
      };
    },

    addCommands() {
      return {
        showResizeNodeDropCursor:
          (pos: number) =>
          ({ tr, dispatch }) => {
            if (dispatch) {
              tr.setMeta("resizeNodeDropCursor", { pos, show: true });
            }
            return true;
          },
        hideResizeNodeDropCursor:
          () =>
          ({ tr, dispatch }) => {
            if (dispatch) {
              tr.setMeta("resizeNodeDropCursor", { show: false });
            }
            return true;
          },
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("resizeNodeDropCursor"),

          state: {
            init() {
              return {
                pos: null as number | null,
                show: false,
              };
            },

            apply(tr, value) {
              const meta = tr.getMeta("resizeNodeDropCursor");
              if (meta) {
                return {
                  pos: meta.pos ?? null,
                  show: meta.show ?? false,
                };
              }
              return value;
            },
          },

          props: {
            decorations(state) {
              const { pos, show } = this.getState(state);

              if (!show || pos === null) {
                return DecorationSet.empty;
              }

              const decoration = Decoration.widget(
                pos,
                () => {
                  const cursor = document.createElement("div");
                  cursor.className = this.spec.options.class;

                  // Apply inline styles for immediate visual feedback
                  Object.assign(cursor.style, {
                    position: "absolute",
                    top: "0",
                    right: "-1px",
                    width: this.spec.options.width,
                    height: "100%",
                    backgroundColor: this.spec.options.color,
                    borderRadius: "1px",
                    pointerEvents: "none",
                    zIndex: "1000",
                    boxShadow: `0 0 4px ${this.spec.options.color}`,
                    transition: "opacity 0.15s ease-in-out",
                    opacity: "1",
                  });

                  return cursor;
                },
                {
                  key: "resize-node-drop-cursor",
                  side: 1, // Position after the node
                },
              );

              return DecorationSet.create(state.doc, [decoration]);
            },
          },

          // Helper methods for the DragHandle integration
          spec: {
            options: this.options,
          },
        }),
      ];
    },

    // Helper function to find ResizeNode at coordinates (for DragHandle integration)
    addStorage() {
      return {
        findResizeNodeAtCoords: (
          view: any,
          coords: { x: number; y: number },
        ) => {
          const pos = view.posAtCoords({
            left: coords.x,
            top: coords.y,
          });

          if (!pos) {
            return null;
          }

          const $pos = view.state.doc.resolve(pos.pos);

          // Walk up the node tree to find a ResizeNode
          for (let depth = $pos.depth; depth >= 0; depth--) {
            const node = $pos.node(depth);
            if (node.type.name === "resizeNode") {
              return {
                node,
                pos: $pos.start(depth) - 1, // Position before the node
                endPos: $pos.start(depth) - 1 + node.nodeSize, // Position after the node
              };
            }
          }
          return null;
        },
      };
    },

    // Add global attributes for styling
    addGlobalAttributes() {
      return [
        {
          types: ["resizeNode"],
          attributes: {
            "data-resize-node-droppable": {
              default: "true",
              renderHTML: () => ({ "data-resize-node-droppable": "true" }),
            },
          },
        },
      ];
    },
  });
