import S from "./EmbeddedEngineDocContent.module.css";
import { MarkdownLink } from "./MarkdownLink";

export const markdownComponentsOverride = {
  a: MarkdownLink,
};

export const hideUnnecessaryMarkdownElements = (
  markdownElement: HTMLElement | null,
) => {
  if (!markdownElement) {
    return;
  }

  hideIntroductoryElements(markdownElement);
  hideJekyllTemplateIncludes(markdownElement);
};

const hideJekyllTemplateIncludes = (markdownElement: HTMLElement) => {
  // Hide elements matching template includes (we can't parse them from the app)
  markdownElement.querySelectorAll("p").forEach((element) => {
    // Check if the element's text content contains "{%" and it has no child elements
    if (
      element.textContent &&
      element.textContent.includes("{%") &&
      element.children.length === 0
    ) {
      (element as HTMLElement).classList.add(S.hidden);
    }
  });
};

const hideIntroductoryElements = (markdownElement: HTMLElement) => {
  // Hide initial elements, like title and heading (they are redundant in this context)
  const h1Element = markdownElement.querySelector("h1");

  if (h1Element) {
    h1Element.classList.add(S.hidden);

    // Hide everything before the h1
    let prevSibling = h1Element.previousElementSibling;

    while (prevSibling) {
      prevSibling.classList.add(S.hidden);
      prevSibling = prevSibling.previousElementSibling;
    }

    // Hide blockquote and p elements after the h1 (and before the next heading)
    let nextSibling = h1Element.nextElementSibling;

    while (
      nextSibling?.tagName === "BLOCKQUOTE" ||
      nextSibling?.tagName === "P"
    ) {
      nextSibling.classList.add(S.hidden);
      nextSibling = nextSibling.nextElementSibling;
    }
  }
};
