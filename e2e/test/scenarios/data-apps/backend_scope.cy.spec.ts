import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
} from "e2e/support/helpers";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

const TIMEOUT = 30000;

describe("scenarios > data apps > backend scope", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  /**
   * The unit and middleware tests can only assert the endpoints we already thought to list.
   * This one works the other way round: drive the SDK surface a data app actually exposes and
   * let the backend tell us what it refuses. The scope guard `H.openDataApp` installs records
   * every rejection and the root `afterEach` fails the test on any, so this spec only has to
   * exercise the surface.
   */
  it("serves the whole InteractiveQuestion surface without refusing a request for scope", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: TEST_ENV,
    });
    H.openDataApp(APP_NAME);

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("data-app-content", { timeout: TIMEOUT }).should("exist");

      // The toolbar only mounts once the first query has come back, so this doubles as the
      // wait for `/api/dataset`.
      cy.findByTestId("interactive-question-result-toolbar", {
        timeout: TIMEOUT,
      }).should("exist");

      cy.log("Chart type picker — loads visualization metadata");
      cy.findByTestId("chart-type-selector-button").click();
      cy.findByText("More charts").should("be.visible");
      // Toggle the trigger to close: key events would land on the parent document, not the
      // iframe, and Mantine treats a stray Escape as a modal dismiss.
      cy.findByTestId("chart-type-selector-button").click();

      cy.log("Visualization settings");
      cy.findByTestId("viz-settings-button").click();
      cy.findByTestId("viz-settings-button").click();

      cy.log("Filter picker — loads table metadata and field values");
      cy.findByTestId("filter-dropdown-button").click();
      // This `within` is the whole iframe, so a column name also matches the table
      // rendered behind the picker. Pick from the popover the button just opened.
      cy.get('[data-element-id="mantine-popover"]')
        .should("have.length.above", 0)
        .last()
        .within(() => {
          cy.findByText("Total").click();
        });
      cy.findByText("Add filter").click();

      cy.log("Summarize picker — loads the aggregation/column pickers");
      // The button is labelled by how many summaries the question has, and with
      // none it opens the aggregation picker directly — the badge list, with its
      // "Add another summary", is what a question that already aggregates opens.
      cy.findByText("Summarize").click();
      cy.findByTestId("aggregation-picker").should("be.visible");
      cy.findByText("Summarize").click();

      cy.log("Group-by picker");
      cy.findByText("Group").click();
      cy.findByText("Group").click();

      cy.log(
        "Download menu — loads the export formats and downloads preference",
      );
      cy.findByTestId("question-download-widget-button").click();
      cy.findByTestId("question-download-widget-button").click();

      cy.log("Notebook editor — loads databases, schemas, tables and fields");
      cy.findByTestId("notebook-button").click();
      cy.findByText("Back to visualization", { timeout: TIMEOUT }).should(
        "be.visible",
      );

      cy.log("Add a notebook filter step");
      cy.findByTestId("action-buttons").findByText("Filter").click();
      cy.get('[data-element-id="mantine-popover"]')
        .should("have.length.above", 0)
        .last()
        .within(() => {
          // A sparse float has no cached field values, so the picker defaults to
          // Between and offers Min/Max. A low-cardinality column like Quantity
          // defaults to `=` and offers a value list instead.
          cy.findByText("Discount").click();
        });
      cy.findByPlaceholderText("Min").type("2");
      cy.findByText("Add filter").click();

      cy.log("Re-run the edited query");
      cy.findByText("Visualize").click();
      cy.findByText("Back to visualization", { timeout: TIMEOUT }).should(
        "not.exist",
      );
    });
  });
});
