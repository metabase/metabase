import { getSdkRoot } from "../e2e-embedding-sdk-helpers";

import {
  type MountSdkContentOptions,
  mountSdkContent,
} from "./component-embedding-sdk-helpers";

const VISUALIZATION_ERROR_REGEX = /Visualization/;
const DASHBOARD_GRID_ERROR_REGEX = /DashboardGrid/;
const UNSAFE_COMPONENT_ERROR_REGEX = /UNSAFE_component/;
const UNRECOGNIZED_PROP_REGEX =
  /Warning: React does not recognize the `.*?` prop on a DOM element/;
// const NON_BOOLEAN_ATTR_REGEX =
//   /Warning: Received `.*?` for a non-boolean attribute/;
// const INVALID_DOM_PROPS_REGEX =
//   /Warning: Invalid values for props .* on <.*?> tag/;

const knownErrorPatterns = [
  [UNRECOGNIZED_PROP_REGEX],
  // [NON_BOOLEAN_ATTR_REGEX],
  // [INVALID_DOM_PROPS_REGEX],
  [UNSAFE_COMPONENT_ERROR_REGEX, VISUALIZATION_ERROR_REGEX],
  [UNSAFE_COMPONENT_ERROR_REGEX, DASHBOARD_GRID_ERROR_REGEX],
];

const hasKnownError = (message: string) =>
  knownErrorPatterns.some(patterns =>
    patterns.every(regex => regex.test(message)),
  );

/**
 * Assert that there is no **known** console errors that had been
 * fixed in the past to avoid regressions.
 *
 * @param consoleErrorStub - The name of the `console.error` stub to check.
 **/
export function mountSdkContentAndAssertNoKnownErrors(
  children: JSX.Element,
  mountSdkContentOptions: MountSdkContentOptions = {},
  callback?: () => void,
) {
  cy.window().then(win => {
    cy.stub(win.console, "error").as("consoleError").callThrough();
  });

  mountSdkContent(children, { strictMode: true, ...mountSdkContentOptions });
  // Most lifecycle warnings only show up after the component has mounted,
  // so we must wait for the component to mount first.
  getSdkRoot().within(() => {
    cy.findByTestId("loading-indicator").should("not.exist");
  });

  // Execute the callback if provided
  if (callback) {
    callback();
  }

  cy.get<sinon.SinonStub>("@consoleError").should($console => {
    const lifecycleErrors = $console.args.filter(args => {
      const message = args.join(" ");
      return hasKnownError(message);
    });

    expect(lifecycleErrors.length).to.equal(
      0,
      "there must be no unsafe lifecycle warnings in Visualization",
    );
  });
}
