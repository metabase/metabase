import { getSdkRoot } from "../e2e-embedding-sdk-helpers";

import {
  type MountSdkContentOptions,
  mountSdkContent,
} from "./component-embedding-sdk-helpers";

/**
 * Assert that there is no **known** console errors that had been
 * fixed in the past to avoid regressions.
 *
 * @param consoleErrorStub - The name of the `console.error` stub to check.
 **/
export function mountSdkContentAndAssertNoKnownErrors(
  children: JSX.Element,
  mountSdkContentOptions: MountSdkContentOptions = {},
) {
  // Monitor console errors, but don't log them in the Cypress runner UI.
  cy.window().then((win) => {
    cy.stub(win.console, "error").log(false).as("consoleError");
  });

  // Mount the component with strict mode enabled to surface development-time warnings.
  mountSdkContent(children, { strictMode: true, ...mountSdkContentOptions });

  // Most lifecycle warnings only show up after the component has mounted,
  // so we must wait for the component to mount first.
  getSdkRoot().within(() => {
    cy.findByTestId("loading-indicator").should("not.exist");
  });

  cy.get<sinon.SinonStub>("@consoleError").should(($console) => {
    const lifecycleErrors = $console.args.filter((args) => {
      const message = args.join(" ");

      const hasUnsafeLifecycleWarning = message.includes("UNSAFE_component");

      // Check that <Visualization /> is free of React lifecycle warnings
      const visualizationHasUnsafeCycleWarning =
        message.includes("Visualization") && hasUnsafeLifecycleWarning;

      // Check that <DashboardGrid /> is free of React lifecycle warnings
      const dashboardGridHasUnsafeCycleWarning =
        message.includes("DashboardGrid") && hasUnsafeLifecycleWarning;

      return (
        visualizationHasUnsafeCycleWarning || dashboardGridHasUnsafeCycleWarning
      );
    });

    expect(lifecycleErrors.length).to.equal(
      0,
      "there must be no unsafe lifecycle warnings in Visualization",
    );
  });
}
