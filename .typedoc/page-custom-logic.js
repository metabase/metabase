const GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY = "generatedDocReturnUrl";

const isEmbeddingSdkApiDocsPage = (href) =>
  href.includes("/embedding/sdk/api/");

const storeReturnUrl = () => {
  const ref = document.referrer;

  const isRefFromNonApiPage = ref && !isEmbeddingSdkApiDocsPage(ref);

  if (isRefFromNonApiPage) {
    sessionStorage.setItem(GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY, ref);
  }
};

/**
 * Called from `navigationLinks` field of `typedoc.config.mjs
 */
// eslint-disable-next-line no-unused-vars
const navigateBack = ({ fallbackUrl }) => {
  const returnUrl = sessionStorage.getItem(
    GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY,
  );

  if (returnUrl) {
    sessionStorage.removeItem(GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY);

    location.href = returnUrl;
  } else {
    location.href = fallbackUrl;
  }
};

/**
 * Inserts word breaks (<wbr> tags) into the text content of an element
 */
function insertWordBreaks(textContent) {
  const regex = /[\s\S]*?(?:[^_-][_-](?=[^_-])|[^A-Z](?=[A-Z][^A-Z]))/g;
  const result = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(textContent)) !== null) {
    result.push(match[0], "<wbr>");
    lastIndex += match[0].length;
  }

  result.push(textContent.slice(lastIndex));

  return result.join("");
}

/**
 * Inserts word breaks (<wbr> tags) into the text content of specific elements
 * Currently the typedoc automatically adds word breaks to the identifier names in the right column, but does not do
 * it for the left column and the main content.
 * This logic fixes it and does it for the left column and the main content.
 * This fixes unwanted horizontal scrollbars and overflow issues.
 *
 * We have to use `MutationObserver` because links are added by the typedoc dynamically, so we need to wait for them to be added to the DOM
 */
const setupWordBreaks = () => {
  const apply = () => {
    const leftNavigationMenuItemElements =
      document.querySelectorAll("ul > li > a > span");
    const contentMenuItemElements =
      document.querySelectorAll("dl > dt > span > a");

    const itemElements = [
      ...leftNavigationMenuItemElements,
      ...contentMenuItemElements,
    ];

    itemElements.forEach((element) => {
      if (!element.dataset.wordBreakApplied) {
        element.innerHTML = insertWordBreaks(element.textContent);
        element.dataset.wordBreakApplied = "true";
      }
    });
  };

  const observer = new MutationObserver(apply);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
};

const init = () => {
  storeReturnUrl();
  setupWordBreaks();
};

document.addEventListener("DOMContentLoaded", init);
