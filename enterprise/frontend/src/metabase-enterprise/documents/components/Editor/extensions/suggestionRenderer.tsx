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
import type React from "react";

export const createSuggestionRenderer = <I = unknown, TSelected = unknown>(
  SuggestionComponent: React.ComponentType<SuggestionProps<I, TSelected>>,
) => {
  return () => {
    let component: ReactRenderer | undefined;
    let currentClientRect: (() => DOMRect | null) | null | undefined;
    let cleanupAutoUpdate: (() => void) | undefined;

    function repositionComponent(clientRect: DOMRect | null) {
      if (!component || !component.element) {
        return;
      }

      if (!clientRect) {
        return;
      }

      const element = component.element;
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const virtualElement: VirtualElement = {
        getBoundingClientRect() {
          return clientRect;
        },
      };

      computePosition(virtualElement, element, {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [
          flip({
            fallbackPlacements: ["top-start", "bottom-end", "top-end"],
            padding: 4,
          }),
          shift({
            padding: 4,
          }),
          size({
            padding: 4,
            apply({ availableHeight, elements }) {
              // Dynamically adjust max height based on available space
              const maxHeight = Math.min(400, availableHeight - 8);
              Object.assign(elements.floating.style, {
                maxHeight: `${maxHeight}px`,
                overflow: "auto",
              });
            },
          }),
        ],
      }).then((pos) => {
        if (component?.element instanceof HTMLElement) {
          Object.assign(component.element.style, {
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            position: "fixed",
            zIndex: "5",
            backgroundColor: "var(--mb-color-background)",
            border: "1px solid var(--mb-color-border)",
            borderRadius: "8px",
            boxShadow: "0 4px 10px var(--mb-color-shadow)",
            width: "320px",
            padding: "0.75rem",
            boxSizing: "border-box",
            overflowY: "auto",
          });
        }
      });
    }

    const setupAutoUpdate = () => {
      if (!component?.element || !(component.element instanceof HTMLElement)) {
        return;
      }

      const element = component.element;
      const virtualElement: VirtualElement = {
        getBoundingClientRect() {
          return currentClientRect?.() ?? new DOMRect();
        },
      };

      // Clean up previous auto update if it exists
      if (cleanupAutoUpdate) {
        cleanupAutoUpdate();
      }

      // Set up auto update to handle scroll and resize
      cleanupAutoUpdate = autoUpdate(
        virtualElement,
        element,
        () => {
          if (currentClientRect) {
            repositionComponent(currentClientRect());
          }
        },
        {
          animationFrame: true,
        },
      );
    };

    return {
      onStart: (props: SuggestionProps<I, TSelected>) => {
        component = new ReactRenderer(SuggestionComponent, {
          props,
          editor: props.editor,
        });

        if (component.element instanceof HTMLElement) {
          document.body.appendChild(component.element);
        }
        currentClientRect = props.clientRect;
        repositionComponent(props.clientRect?.() ?? null);
        setupAutoUpdate();
      },

      onUpdate(props: SuggestionProps<I, TSelected>) {
        component?.updateProps(props);
        currentClientRect = props.clientRect;
        repositionComponent(props.clientRect?.() ?? null);

        // Re-setup auto update if clientRect changed
        if (props.clientRect !== currentClientRect) {
          setupAutoUpdate();
        }
      },

      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === "Escape") {
          if (
            component?.element instanceof HTMLElement &&
            document.body.contains(component.element)
          ) {
            document.body.removeChild(component.element);
          }
          component?.destroy();
          return true;
        }

        const ref = component?.ref;
        if (
          ref &&
          typeof ref === "object" &&
          "onKeyDown" in ref &&
          typeof ref.onKeyDown === "function"
        ) {
          return ref.onKeyDown(props);
        }
        return false;
      },

      onExit() {
        // Clean up auto update
        if (cleanupAutoUpdate) {
          cleanupAutoUpdate();
          cleanupAutoUpdate = undefined;
        }

        if (
          component?.element instanceof HTMLElement &&
          document.body.contains(component.element)
        ) {
          document.body.removeChild(component.element);
        }
        component?.destroy();
        currentClientRect = undefined;
      },
    };
  };
};
