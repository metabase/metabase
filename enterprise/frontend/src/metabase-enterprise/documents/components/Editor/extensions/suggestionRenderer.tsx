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

    function repositionComponent(clientRect: DOMRect | null) {
      if (!component || !component.element) {
        return;
      }

      if (!clientRect) {
        return;
      }

      const virtualElement: VirtualElement = {
        getBoundingClientRect() {
          return clientRect;
        },
      };

      computePosition(virtualElement, component.element as HTMLElement, {
        placement: "bottom-start",
      }).then((pos) => {
        Object.assign((component?.element as HTMLElement).style, {
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          position: pos.strategy === "fixed" ? "fixed" : "absolute",
        });
      });
    }

    return {
      onStart: (props: SuggestionProps<I, TSelected>) => {
        component = new ReactRenderer(SuggestionComponent, {
          props,
          editor: props.editor,
        });

        document.body.appendChild(component.element);
        repositionComponent(props.clientRect?.());
      },

      onUpdate(props: SuggestionProps<I, TSelected>) {
        component?.updateProps(props);
        repositionComponent(props.clientRect?.());
      },

      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === "Escape") {
          if (component?.element && document.body.contains(component.element)) {
            document.body.removeChild(component.element);
          }
          component?.destroy();
          return true;
        }

        return component?.ref?.onKeyDown?.(props) ?? false;
      },

      onExit() {
        if (component?.element && document.body.contains(component.element)) {
          document.body.removeChild(component.element);
        }
        component?.destroy();
      },
    };
  };
};
