import {
  restore,
  visitDashboard,
  visitEmbeddedPage,
} from "__support__/e2e/cypress";

import { questionDetails as nativeQuestionDetails } from "./embedding-native";
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

    cy.createDashboard({ name: "E2E Embedding Dashboard" }).then(
      ({ body: { id: dashboard_id } }) => {
        const url = `/api/dashboard/${dashboard_id}/cards`;

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [
            {
              name: "Month and Year",
              slug: "month_and_year",
              id: "7a1716b7",
              type: "date/month-year",
              sectionId: "date",
            },
            {
              name: "ID",
              slug: "id",
              id: "ae4a4351",
              type: "id",
              sectionId: "id",
            },
            {
              name: "Greater than or equal to",
              slug: "greater_than_or_equal_to",
              id: "df770c16",
              type: "number/>=",
              sectionId: "number",
            },
            {
              name: "Text",
              slug: "text",
              id: "d7e0814d",
              type: "string/=",
              sectionId: "string",
            },
          ],
        });

        cy.request("POST", url, {
          cardId: null,
        }).then(({ body: { id, card_id } }) => {
          cy.request("PUT", url, {
            cards: [
              {
                id,
                card_id,
                row: 0,
                col: 0,
                // Full width markdown title
                sizeX: 18,
                sizeY: 2,
                visualization_settings: {
                  virtual_card: {
                    name: null,
                    display: "text",
                    visualization_settings: {},
                    dataset_query: {},
                    archived: false,
                  },
                  text: "# Our Awesome Analytics",
                  "text.align_vertical": "middle",
                  "text.align_horizontal": "center",
                },
                parameter_mappings: [],
              },
            ],
          });
        });

        cy.createNativeQuestion(nativeQuestionDetails).then(
          ({ body: { id: card_id } }) => {
            cy.request("POST", url, {
              cardId: card_id,
            }).then(({ body: { id } }) => {
              cy.request("PUT", url, {
                cards: [
                  {
                    id,
                    card_id,
                    row: 2,
                    col: 0,
                    sizeX: 9,
                    sizeY: 8,
                    visualization_settings: {},
                  },
                ],
              });
            });
          },
        );

        cy.request("POST", url, {
          cardId: 1,
        }).then(({ body: { id } }) => {
          cy.request("PUT", url, {
            cards: [
              {
                id,
                card_id: 1,
                row: 2,
                col: 10,
                sizeX: 9,
                sizeY: 8,
                visualization_settings: {},
              },
            ],
          });
        });

        cy.request("POST", url, {
          cardId: 3,
        }).then(({ body: { id } }) => {
          cy.request("PUT", url, {
            cards: [
              {
                id,
                card_id: 3,
                row: 11,
                col: 0,
                sizeX: 12,
                sizeY: 8,
                visualization_settings: {},
              },
            ],
          });
        });

        cy.request("PUT", "/api/card/2", {
          display: "scalar",
        });

        cy.request("POST", url, {
          cardId: 2,
        }).then(({ body: { id } }) => {
          cy.request("PUT", url, {
            cards: [
              {
                id,
                card_id: 2,
                row: 11,
                col: 13,
                sizeX: 6,
                sizeY: 8,
                visualization_settings: {},
              },
            ],
          });
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
