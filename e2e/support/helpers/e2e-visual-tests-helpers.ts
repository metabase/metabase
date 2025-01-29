import { H } from "e2e/support";

const overrideTimers = () => {
  cy.clock(NaN, ["setTimeout", "clearTimeout"]);
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

  if (isVisualTestEnvRunOrTag) {
    overrideTimers();
  }
};

export const buildSnapshotName = (name: string) =>
  `${Cypress.currentTest.title} ${name}`.replaceAll(" ", "_").toLowerCase();

const PREVENT_POINTER_EVENTS_STYLES = `
  *, *::before, *::after {
    pointer-events: none;
    transition: none !important;
    animation: none !important;
  }
`;

export const captureSnapshot = (
  name: string,
  { allowPointerEvents }: { allowPointerEvents?: boolean } = {
    allowPointerEvents: false,
  },
) => {
  const isInteractive = Cypress.config("isInteractive");
  const doNotFail = isInteractive || Cypress.env("DO_NOT_FAIL");

  // The `cy.clock` call here does not move timers. We need it just to not throw an error when calling `cy.tick`
  // The proper `cy.clock` call that affects visual tests is done in `e2e/support/cypress.js` in `beforeEach` hook
  overrideTimers();
  cy.tick(999999);

  cy.document().then(document => {
    const style = document.createElement("style");

    style.innerHTML = `
      ${
        // In most cases we want to disable pointer events to prevent flakiness caused by hover states
        !allowPointerEvents && PREVENT_POINTER_EVENTS_STYLES
      }
    `;

    // Hide scrollbars visually and make its width constant before taking a snapshot
    document.head.appendChild(style);

    cy.compareSnapshot({
      name: buildSnapshotName(name),
      retryOptions: { doNotFail },
      cypressScreenshotOptions: {
        disableTimersAndAnimations: true,
      },
    }).then(() => {
      // Restore styles back to default
      style.remove();
    });
  });
};
