const GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY = "generatedDocReturnUrl";
const GENERATED_DOC_RETURN_URL_LINK_TEXT = "Back";

/**
 * Checks if the given URL is an embedding SDK API docs page.
 */
const isEmbeddingSdkApiDocsPage = (href) =>
  href.includes("/embedding/sdk/api/");

/**
 * Sets up the "Back to documentation" link in the generated docs.
 * When a user comes from non-api page, we store the referrer and show the `back` link that n redirects to that referrer.
 * When user comes to the API page directly, we remove the `back` link.
 */
const setupReturnUrlLink = () => {
  const ref = document.referrer;

  const isRefFromNonApiPage = ref && !isEmbeddingSdkApiDocsPage(ref);

  if (isRefFromNonApiPage) {
    sessionStorage.setItem(GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY, ref);
  }

  const backLink = Array.from(
    document.querySelectorAll("#tsd-toolbar-links > a"),
  ).find((a) =>
    // Sadly the links don't have any unique identifiers, so we have to rely on the text
    a.textContent.trim().includes(GENERATED_DOC_RETURN_URL_LINK_TEXT),
  );

  const returnUrl = sessionStorage.getItem(
    GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY,
  );

  if (backLink && !returnUrl) {
    backLink.remove();
  }
};

/**
 * Called from `navigationLinks` field of `typedoc.config.mjs
 * Navigate sto the stored by the `setupReturnUrlLink` link
 */
const navigateBack = () => {
  const returnUrl = sessionStorage.getItem(
    GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY,
  );

  if (returnUrl) {
    sessionStorage.removeItem(GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY);

    location.href = returnUrl;
  }
};

/**
 * Disclaimer:
 * Right now it's unclear how to generate the `internal` module but completely exclude it from all navigation/etc using
 * default typedoc config.
 *
 * So this file is a manual workaround to hide the `internal` module from the navigation and the main page.
 */

/**
 * Redirects from the "internal" module index page to the main index page
 */
const setupRedirectsFromInternalModule = () => {
  const href = location.href;
  const indexPage = href.replace(/(.*\/html)\/.*/, "$1/index.html");

  const isInternalModule =
    href.endsWith("internal.html") || href.endsWith("internal");

  if (isInternalModule) {
    location.replace(indexPage);
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

/**
 * Removes a content section with the given name
 */
const removeContentSection = (sectionName) => {
  const summarySelector = `.tsd-accordion-summary[data-key="section-${sectionName}"]`;
  const elementsToHide = document.querySelectorAll(
    `
      .tsd-panel-group.tsd-member-group.tsd-accordion:has(${summarySelector}),
      .tsd-page-navigation-section:has(${summarySelector})
    `,
  );

  elementsToHide.forEach((element) => {
    element.remove();
  });
};

/**
 * Removes the `internal` menu item from the left navigation menu
 */
const removeRightNavigationMenuInternalItems = () => {
  const internalModuleItem = document.querySelector(
    '.tsd-navigation .tsd-accordion ul > li:has(summary[data-key="other$internal"])',
  );

  if (!internalModuleItem) {
    return;
  }

  internalModuleItem.remove();
};

/**
 * Removes the "internal" item from the `other` category of the content menu
 */
const removeContentMenuInternalItems = () => {
  const internalCategoryItem = document.querySelector(
    ".tsd-member-summaries > #internal",
  );

  if (!internalCategoryItem) {
    return;
  }

  internalCategoryItem.remove();
};

const removePageElements = () => {
  const CONTENT_SECTIONS_TO_REMOVE = ["Modules"];

  CONTENT_SECTIONS_TO_REMOVE.forEach(removeContentSection);
  removeRightNavigationMenuInternalItems();
  removeContentMenuInternalItems();
};

const observer = new MutationObserver(removePageElements);

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

const init = () => {
  setupReturnUrlLink();
  setupRedirectsFromInternalModule();
  setupWordBreaks();
};

document.addEventListener("DOMContentLoaded", init);
