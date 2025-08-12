import { type VirtualElement, computePosition } from "@floating-ui/dom";
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
      }).then((pos) => {
        if (component?.element instanceof HTMLElement) {
          Object.assign(component.element.style, {
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            position: pos.strategy === "fixed" ? "fixed" : "absolute",
            zIndex: "3",
          });
        }
      });
    }

    const handleScroll = () => {
      if (currentClientRect) {
        repositionComponent(currentClientRect());
      }
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

        // Add scroll listeners to reposition on scroll
        window.addEventListener("scroll", handleScroll, true);
        window.addEventListener("resize", handleScroll);
      },

      onUpdate(props: SuggestionProps<I, TSelected>) {
        component?.updateProps(props);
        currentClientRect = props.clientRect;
        repositionComponent(props.clientRect?.() ?? null);
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
        // Remove scroll listeners
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", handleScroll);

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
