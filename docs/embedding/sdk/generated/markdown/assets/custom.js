const SECTIONS_TO_HIDE = ["Modules"];

/**
 * Hides a section with the given name
 */
const hideSection = sectionName => {
  const summarySelector = `.tsd-accordion-summary[data-key="section-${sectionName}"]`;
  const sectionsToHide = document.querySelectorAll(
    `
      .tsd-panel-group.tsd-member-group.tsd-accordion:has(${summarySelector}),
      .tsd-page-navigation-section:has(${summarySelector})
    `,
  );

  sectionsToHide.forEach(section => {
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

  const internalItemsToHide = document.querySelectorAll(
    ".tsd-accordion .tsd-nested-navigation > li:not(:has(a.current))",
  );

  internalItemsToHide.forEach(item => {
    item.remove();
  });
};

const adjustPage = () => {
  SECTIONS_TO_HIDE.forEach(hideSection);
  adjustInternalMenuItems();
};

const observer = new MutationObserver(adjustPage);

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
