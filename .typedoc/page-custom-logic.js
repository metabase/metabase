const GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY = "generatedDocReturnUrl";
const GENERATED_DOC_RETURN_URL_LINK_TEXT = "Back";

/**
 * Sets up the "Back to documentation" link in the generated docs.
 */
const setupReturnUrlLink = () => {
  const ref = document.referrer;
  const isValidRef = ref && !ref.includes("/embedding/sdk/api/");

  if (isValidRef) {
    sessionStorage.setItem(GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY, ref);
  }

  const backLink = Array.from(
    document.querySelectorAll("#tsd-toolbar-links > a"),
  ).find((a) =>
    a.textContent.trim().includes(GENERATED_DOC_RETURN_URL_LINK_TEXT),
  );

  const returnUrl = sessionStorage.getItem(
    GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY,
  );

  if (backLink && !returnUrl) {
    backLink.style.display = "none";
  }
};

/**
 * Called from `navigationLinks` field of `typedoc.config.mjs
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
 * Inserts word breaks into the text content of an element
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
 * Inserts word breaks into the text content of specific elements
 */
const setupWordBreaks = () => {
  const apply = () => {
    const elements = [
      ...document.querySelectorAll("ul > li > a > span"),
      ...document.querySelectorAll("dl > dt > span > a"),
    ];

    elements.forEach((element) => {
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
 * Hides a section with the given name
 */
const hideSection = (sectionName) => {
  const summarySelector = `.tsd-accordion-summary[data-key="section-${sectionName}"]`;
  const sectionsToHide = document.querySelectorAll(
    `
      .tsd-panel-group.tsd-member-group.tsd-accordion:has(${summarySelector}),
      .tsd-page-navigation-section:has(${summarySelector})
    `,
  );

  sectionsToHide.forEach((section) => {
    section.remove();
  });
};

/**
 * Shows only a `selected` item for the "internal" module
 */
const adjustInternalMenuItems = () => {
  const internalModuleItem = document.querySelector(
    '.tsd-navigation .tsd-accordion ul > li:has(summary[data-key="other$internal"])',
  );

  if (!internalModuleItem) {
    return;
  }

  internalModuleItem.remove();
};

/**
 * Removes the "internal" item from the `misc` category
 */
const adjustInternalCategoryItem = () => {
  const internalCategoryItem = document.querySelector(
    ".tsd-member-summaries > #internal",
  );

  if (!internalCategoryItem) {
    return;
  }

  internalCategoryItem.remove();
};

const adjustPage = () => {
  const SECTIONS_TO_HIDE = ["Modules"];

  SECTIONS_TO_HIDE.forEach(hideSection);
  adjustInternalMenuItems();
  adjustInternalCategoryItem();
};

const observer = new MutationObserver(adjustPage);

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
