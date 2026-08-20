import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
} from "e2e/support/helpers";

import { DATA_APP_TEST_ENV as TEST_ENV } from "./helpers";

const { H } = cy;

/**
 * The two rejections endpoint scope enforcement can emit. `scope_not_permitted` comes from
 * `ensure-scopes-checked` — the endpoint declares no `:scope` at all, so a narrowed request
 * may not reach it. `unsupported_scope` comes from `enforce-scope` — the endpoint is scoped,
 * but not for the scope the request carries. Either one inside a data app means a route the
 * SDK really uses was never tagged `data-apps:base`.
 */
const SCOPE_ERRORS = ["scope_not_permitted", "unsupported_scope"];

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
   * let the backend tell us what it refuses. Every request the sandbox makes is marked
   * `X-Metabase-Client: data-app` and therefore confined to `data-apps:base`, so any scope
   * rejection recorded here is a missing tag rather than a permission problem — the session
   * is an admin.
   */
  it("serves the whole InteractiveQuestion surface without refusing a request for scope", () => {
    const denials: string[] = [];

    cy.intercept("/api/**", (req) => {
      // `after:response` rather than a `req.continue` callback: the latter buffers the
      // body, which would sit in front of the streamed `/api/dataset` responses.
      req.on("after:response", (res) => {
        // `res.body` is typed as `any` by Cypress and is whatever the endpoint returned;
        // the scope middleware answers with a JSON `{error, message}` body.
        const error = (res.body as { error?: string } | undefined)?.error;
        if (res.statusCode === 403 && SCOPE_ERRORS.includes(error ?? "")) {
          denials.push(`${req.method} ${new URL(req.url).pathname} → ${error}`);
        }
      });
    });

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
      cy.findByText("Summarize").click();
      cy.findByText("Add another summary").should("be.visible");
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
          cy.findByText("Quantity").click();
        });
      cy.findByPlaceholderText("Min").type("2");
      cy.findByText("Add filter").click();

      cy.log("Re-run the edited query");
      cy.findByText("Visualize").click();
      cy.findByText("Back to visualization", { timeout: TIMEOUT }).should(
        "not.exist",
      );
    });

    cy.then(() => {
      expect(denials, `scope rejections:\n${denials.join("\n")}`).to.be.empty;
    });
  });
});
