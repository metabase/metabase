import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type PropsWithChildren,
  createElement,
  useEffect,
  useState,
} from "react";

type HideIfEmptyProps<C extends ElementType> = PropsWithChildren<
  { component: C } & Omit<ComponentPropsWithoutRef<C>, "component" | "children">
>;

/**
 * Renders children inside the given `component` when they have visible content.
 * When children are empty, renders a hidden sentinel `<div>` to keep observing
 * for content changes, while removing the styled wrapper from the DOM entirely.
 *
 * This is useful with CSS `:has()` selectors that rely on the wrapper's class
 * being absent when content is empty (e.g., grid layout adjustments).
 */
export function HideIfEmpty<C extends ElementType>({
  component: Component,
  children,
  ...props
}: HideIfEmptyProps<C>) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const shouldRender = useShouldRender(node);

  if (!shouldRender) {
    return (
      <div ref={setNode} hidden>
        {children}
      </div>
    );
  }

  return createElement(Component, { ...props, ref: setNode }, children);
}

function useShouldRender(node: HTMLElement | null): boolean {
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (!node) {
      return;
    }

    const update = () => {
      setShouldRender(hasVisibleContent(node));
    };

    // Run an initial check as soon as the node is attached, before the first observer event
    update();

    const observer = new MutationObserver(update);
    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [node]);

  return shouldRender;
}

/**
 * Elements that are visually meaningful even without text content.
 */
const REPLACED_ELEMENTS = new Set([
  "IMG",
  "SVG",
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);

function hasVisibleContent(element: HTMLElement): boolean {
  if (REPLACED_ELEMENTS.has(element.tagName.toUpperCase())) {
    return true;
  }

  const children = Array.from(element.children);

  // Leaf node: check for direct text content
  if (children.length === 0) {
    return !!element.textContent?.trim();
  }

  return children.some((child) => {
    const el = child as HTMLElement;

    if (el.hidden || el.style?.display === "none") {
      return false;
    }

    return hasVisibleContent(el);
  });
}
