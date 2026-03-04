import { useEffect } from "react";

/**
 * The reason we need to use JavaScript to detect the emptiness of nested elements is that
 * we can't easily determine if an element would be empty because each element has its own logic
 * to decide whether it will render content or not. And we need to expose all those logics to the
 * parent component which would make the code more complex and less maintainable.
 */

/**
 * A hook that hides elements matching the given selector if they are empty
 * @param {string} selector - CSS selector targeting elements we want to hide if empty
 * @param {React.RefObject<HTMLDivElement>} parentElementRef - The parent element ref within which to search for elements to hide
 */
export function useHideEmptyElement(
  selector: string,
  parentElementRef: React.RefObject<HTMLDivElement>,
) {
  /**
   * This hook will traverse the DOM tree starting from the children and going up to the parent.
   * This ensures MutationObserver captures changes in child elements before evaluating parent elements
   * in case a parent component uses this hook as well.
   */
  useEffect(() => {
    const parentElement = parentElementRef.current;
    if (!parentElement) {
      return;
    }

    const updateVisibility = () => {
      const elements: Element[] = [
        parentElement as Element,
        ...Array.from(parentElement.querySelectorAll(selector)),
      ];

      // Bottom-up recursion
      for (let index = elements.length - 1; index >= 0; index--) {
        const element = elements[index];
        const hasText = element.textContent?.trim().length > 0;
        const hasMeaningfulChildren = Array.from(element.children).some(
          (child) => {
            return isElementVisible(child as HTMLElement);
          },
        );

        (element as HTMLElement).style.display =
          !hasText && !hasMeaningfulChildren ? "none" : "";
      }
    };

    // Initial check
    updateVisibility();

    // Set up MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      updateVisibility();
    });

    observer.observe(parentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [selector, parentElementRef]);
}

function isElementVisible(element: HTMLElement): boolean {
  if (element.style.display === "none") {
    return false;
  }

  if (element.children.length === 0) {
    return true;
  }

  return Array.from(element.children).some((child) =>
    isElementVisible(child as HTMLElement),
  );
}
