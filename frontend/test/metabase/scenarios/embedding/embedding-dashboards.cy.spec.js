import {
  restore,
  visitDashboard,
  visitEmbeddedPage,
} from "__support__/e2e/cypress";

import { questionDetails as nativeQuestionDetails } from "./embedding-native";

import {
  markdownCard,
  dateFilter,
  idFilter,
  numericFilter,
  textFilter,
  addCardToDashboard,
} from "./embedding-dashboards";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, ORDERS } = SAMPLE_DATABASE;

describe("scenarios > embedding > dashboards", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Make the viewport tall and widein order to see all cards and filters
    cy.viewport(1800, 1600);

    // Remap Product ID -> Product Title
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    // Convert "Orders" question to a model
    cy.request("PUT", "/api/card/1", { name: "Orders Model", dataset: true });

    // Convert "Orders, Total" to the scalar
    cy.request("PUT", "/api/card/2", {
      display: "scalar",
    });

    cy.createDashboard({ name: "E2E Embedding Dashboard" }).then(
      ({ body: { id: dashboard_id } }) => {
        // Add filters to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [dateFilter, idFilter, numericFilter, textFilter],
        });

        addCardToDashboard({
          card_id: null,
          dashboard_id,
          card: {
            row: 0,
            col: 0,
            // Full width markdown title
            sizeX: 18,
            sizeY: 2,
            visualization_settings: markdownCard,
          },
        });

        cy.createNativeQuestion(nativeQuestionDetails).then(
          ({ body: { id: card_id } }) => {
            addCardToDashboard({
              card_id,
              dashboard_id,
              card: { row: 2, col: 0, sizeX: 9, sizeY: 8 },
            });
          },
        );

        addCardToDashboard({
          card_id: 1,
          dashboard_id,
          card: { row: 2, col: 10, sizeX: 9, sizeY: 8 },
        });

        addCardToDashboard({
          card_id: 3,
          dashboard_id,
          card: { row: 11, col: 0, sizeX: 12, sizeY: 8 },
        });

        addCardToDashboard({
          card_id: 2,
          dashboard_id,
          card: { row: 11, col: 13, sizeX: 6, sizeY: 8 },
        });

        visitDashboard(dashboard_id);
      },
    );
  });

  it("foo", () => {
    cy.log("hi");
  });

  it.skip("should be possible to embed the dashboard with a markdown card only", () => {
    enableSharing();

    publishChanges();

    const payload = {
      resource: { dashboard: 2 },
      params: {},
    };

    visitEmbeddedPage(payload);

    getTitle("E2E Embedding Dashboard");

    getTitle("Our Awesome Analytics");
  });
});

function enableSharing() {
  cy.intercept("GET", "/api/session/properties").as("sessionProperties");

  cy.icon("share").click();
  cy.findByText("Embed this dashboard in an application").click();
  cy.wait("@sessionProperties");
}

function publishChanges(callback) {
  cy.intercept("PUT", "/api/dashboard/*").as("publishChanges");

  cy.button("Publish").click();

  cy.wait(["@publishChanges", "@publishChanges"]).then(xhrs => {
    // Unfortunately, the order of requests is not always the same.
    // Therefore, we must first get the one that has the `embedding_params` and then assert on it.
    const targetXhr = xhrs.find(({ request }) =>
      Object.keys(request.body).includes("embedding_params"),
    );

    callback && callback(targetXhr);
  });
}

function getTitle(title) {
  cy.findByRole("heading", { name: title });
}
