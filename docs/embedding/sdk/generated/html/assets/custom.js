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
    '.tsd-navigation > ul > li:has(summary[data-key="internal"])',
  );

  if (!internalModuleItem) {
    return;
  }

  const hasSelectedInternalItem =
    document.querySelector(
      ".tsd-accordion .tsd-nested-navigation > li:has(a.current)",
    ) !== null;

  if (!hasSelectedInternalItem) {
    internalModuleItem.remove();
  }

  const nestedNavigationInternalItemsToHide = document.querySelectorAll(
    ".tsd-accordion .tsd-nested-navigation > li:not(:has(a.current))",
  );
  const pageNavigationInternalItemsToHide = document.querySelectorAll(
    ".tsd-accordion .tsd-page-navigation-section > div > a[href='#internal']",
  );

  [
    ...nestedNavigationInternalItemsToHide,
    ...pageNavigationInternalItemsToHide,
  ].forEach((item) => {
    item.remove();
  });
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
  setupRedirectsFromInternalModule();
};

init();
