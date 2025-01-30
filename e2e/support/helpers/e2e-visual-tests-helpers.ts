import { H } from "e2e/support";

const overrideTimers = () => {
  cy.clock(NaN, ["setTimeout", "clearTimeout"]);
  cy.tick(999999);
};

export const isVisualTestTags = (tags: string | string[]) => {
  const visualTestTag = "@visual";

  if (Array.isArray(tags)) {
    return tags.includes(visualTestTag);
  }

  return tags === visualTestTag;
};

export const prepareVisualTest = (test: {
  _testConfig: {
    unverifiedTestConfig: { tags: string };
    parent: { _testConfig: { tags: string } };
  };
}) => {
  const isVisualTest = Cypress.env("IS_VISUAL_TEST");

  const isVisualTestEnvRunOrTag =
    isVisualTest ||
    H.isVisualTestTags(test._testConfig.unverifiedTestConfig?.tags) ||
    H.isVisualTestTags(test._testConfig.parent?._testConfig?.tags);

  if (!isVisualTestEnvRunOrTag) {
    return;
  }

  overrideTimers();
};

export const buildSnapshotName = (name: string) =>
  `${Cypress.currentTest.title} ${name}`.replaceAll(" ", "_").toLowerCase();

const appendSupportStyles = ({
  document,
  allowPointerEvents,
}: {
  document: Document;
  allowPointerEvents: boolean | undefined;
}) => {
  const PREVENT_ANIMATION_STYLES = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }`;
  const PREVENT_POINTER_EVENTS_STYLES = `
  *, *::before, *::after {
    pointer-events: none;
  }
`;

  const style = document.createElement("style");

  style.innerHTML = `
      ${PREVENT_ANIMATION_STYLES}

      ${
        // In most cases we want to disable pointer events to prevent flakiness caused by hover states
        !allowPointerEvents && PREVENT_POINTER_EVENTS_STYLES
      }
    `;

  // Hide scrollbars visually and make its width constant before taking a snapshot
  document.head.appendChild(style);

  return () => {
    style.remove();
  };
};

const mockServerDates = () => {
  const originalDates = new WeakMap<Element, string>();
  const dateElements = document.querySelectorAll("[data-server-date]");

  // Replace dates that came from server
  dateElements.forEach(element => {
    originalDates.set(element, element.innerHTML);

    element.innerHTML = "mocked";
  });

  return () => {
    dateElements.forEach(element => {
      const originalDate = originalDates.get(element);

      if (originalDate) {
        element.innerHTML = originalDate;
      }
    });
  };
};

const unfocusElement = (document: Document) => {
  const activeElement = document.activeElement;

  if (!activeElement || activeElement === document.body) {
    return;
  }

  const focusedElement = cy.focused();

  if (focusedElement) {
    focusedElement.blur();
  }

  return () => {
    focusedElement.focus();
  };
};

export const captureSnapshot = (
  name: string,
  { allowPointerEvents }: { allowPointerEvents?: boolean } = {
    allowPointerEvents: false,
  },
) => {
  const isInteractive = Cypress.config("isInteractive");
  const doNotFail = isInteractive || Cypress.env("DO_NOT_FAIL");

  overrideTimers();

  cy.document().then(document => {
    const restoreServerDates = mockServerDates();
    const removeSupportStyles = appendSupportStyles({
      document,
      allowPointerEvents,
    });
    const restoreFocus = unfocusElement(document);

    cy.compareSnapshot({
      name: buildSnapshotName(name),
      retryOptions: { doNotFail },
      cypressScreenshotOptions: {
        disableTimersAndAnimations: true,
      },
    }).then(() => {
      restoreServerDates();
      removeSupportStyles();
      restoreFocus?.();
    });
  });
};
