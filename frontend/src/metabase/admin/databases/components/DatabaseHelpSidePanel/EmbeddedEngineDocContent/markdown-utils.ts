/**
 * Hides elements rendered from the markdown doc that we don't want to show in the side panel.
 * These include h1 and other introductory elements, as well as jekyll template includes.
 */
export const hideUnnecessaryElements = (element: HTMLElement | null) => {
  if (!element) {
    return;
  }

  hideIntroductoryElements(element);
  hideJekyllTemplateIncludes(element);
};

const hideJekyllTemplateIncludes = (element: HTMLElement) => {
  // Hide elements matching template includes (we can't parse them from the app)
  element.querySelectorAll("p").forEach((element) => {
    // Check if the element's text content contains "{%" and it has no child elements
    if (element.textContent?.includes("{%") && element.children.length === 0) {
      (element as HTMLElement).style.display = "none";
    }
  });
};

const hideIntroductoryElements = (element: HTMLElement) => {
  // Hide initial elements, like title and heading (they are redundant in this context)
  const h1Element = element.querySelector("h1");

  if (h1Element) {
    h1Element.style.display = "none";

    // Hide everything before the h1
    let prevSibling = h1Element.previousElementSibling as HTMLElement;

    while (prevSibling) {
      prevSibling.style.display = "none";
      prevSibling = prevSibling.previousElementSibling as HTMLElement;
    }

    // Hide blockquote and p elements after the h1 (and before the next heading)
    let nextSibling = h1Element.nextElementSibling as HTMLElement;

    while (
      nextSibling?.tagName === "BLOCKQUOTE" ||
      nextSibling?.tagName === "P"
    ) {
      nextSibling.style.display = "none";
      nextSibling = nextSibling.nextElementSibling as HTMLElement;
    }
  }
};
