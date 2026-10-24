import {
  DATA_APP_DISPLAY_NAME as APP_DISPLAY_NAME,
  DATA_APP_NAME as APP_NAME,
} from "e2e/support/helpers";

import { dataAppTestEnv, withDataAppQuestions } from "./helpers";

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
  it("serves the whole StaticQuestion surface without refusing a request for scope", () => {
    H.mockDataApp(APP_NAME, {
      displayName: APP_DISPLAY_NAME,
      testEnv: withDataAppQuestions(dataAppTestEnv),
    });
    H.openDataApp(APP_NAME);

    H.dataAppIframe(APP_DISPLAY_NAME).within(() => {
      cy.findByTestId("data-app-content", { timeout: TIMEOUT }).should("exist");

      // The table only renders once the first query has come back, so this doubles as the
      // wait for `/api/dataset`.
      cy.findByTestId("table-body", { timeout: TIMEOUT })
        .findAllByTestId("cell-data")
        .should("have.length.greaterThan", 0);

      cy.log("Column header hover — loads the column's field and its values");
      cy.findAllByTestId("header-cell").first().realHover();

      cy.log("Chart type picker — loads visualization metadata");
      cy.findByTestId("chart-type-selector-button").click();
      cy.findByTestId("chart-type-selector-button").click();

      cy.log(
        "Download menu — loads the export formats and downloads preference",
      );
      cy.findByTestId("question-download-widget-button").click();
      cy.findByTestId("question-download-widget-button").click();
    });
  });
});
