import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type PropsWithChildren,
  createElement,
  useCallback,
  useRef,
  useState,
} from "react";

type RenderIfHasContentProps<C extends ElementType> = PropsWithChildren<
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
export function RenderIfHasContent<C extends ElementType>({
  component: Component,
  children,
  ...props
}: RenderIfHasContentProps<C>) {
  const [shouldRender, setShouldRender] = useState(true);
  const observerRef = useRef<MutationObserver | null>(null);

  const refCallback = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) {
      return;
    }

    const update = () => setShouldRender(hasVisibleContent(node));
    update();

    const observer = new MutationObserver(update);
    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    observerRef.current = observer;
  }, []);

  if (!shouldRender) {
    return (
      <div ref={refCallback} hidden>
        {children}
      </div>
    );
  }

  return createElement(Component, { ...props, ref: refCallback }, children);
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
