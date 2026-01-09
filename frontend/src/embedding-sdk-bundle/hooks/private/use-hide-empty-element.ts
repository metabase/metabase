import { useLayoutEffect } from "react";

/**
 * The reason we need to use JavaScript to detect the emptiness of nested elements is that
 * we can't easily determine if an element would be empty because each element has its own logic
 * to decide whether it will render content or not. And we need to expose all those logics to the
 * parent component which would make the code more complex and less maintainable.
 */
export function useHideEmptyElement(
  selector: string,
  parentElementRef: React.RefObject<HTMLDivElement>,
) {
  // useLayoutEffect runs after DOM mutations but before the screen paints
  useLayoutEffect(() => {
    const parentElement = parentElementRef.current;
    const elements: Element[] = [
      parentElement as Element,
      ...Array.from(parentElement?.querySelectorAll(selector) ?? []),
    ].filter(Boolean);

    // Bottom-up recursion
    for (let index = elements.length - 1; index >= 0; index--) {
      const element = elements[index];
      const hasText = element.textContent.trim().length > 0;
      const hasVisibleChildren = Array.from(element.children).some(
        (child) => (child as HTMLElement).style.display !== "none",
      );

      (element as HTMLElement).style.display =
        !hasText && !hasVisibleChildren ? "none" : "";
    }
  });
}
