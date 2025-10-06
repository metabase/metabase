import {
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  POPOVER_ELEMENT,
  cartesianChartCircle,
  popover,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > dashboard-click-behavior", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    // Make the PRODUCT_ID column a URL column for click behavior tests, to avoid having to create a new model
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/URL",
    });

    // Create a question with custom column that returns a url as a string
    H.createQuestion({
      name: "Orders with URL Expression",
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          // NOTE: this is a question, so it won't have semantic_type set as url, we'll need a model for that
          url_column: [
            "concat",
            "https://example.org/",
            ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          ],
        },
        fields: [
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          ["expression", "url_column", { "base-type": "type/Text" }],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
        limit: 5,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
    });

    H.createDashboardWithQuestions({
      dashboardName: "Orders in a dashboard",
      questions: [
        {
          name: "Orders",
          query: { "source-table": ORDERS_ID, limit: 5 },
        },
        {
          name: "Line chart with disabled click behavior",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
            limit: 5,
          },
        },
        {
          name: "Line chart with internal click behavior",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
            limit: 5,
          },
        },
      ],
      cards: [
        {
          size_x: 24,
          col: 0,
          visualization_settings: {
            column_settings: {
              '["name","SUBTOTAL"]': {
                click_behavior: {
                  type: "link",
                  linkType: "url",
                  linkTemplate: "https://metabase.com",
                  linkTextTemplate: "Link Text Applied",
                },
              },
            },
          },
        },
        {
          size_x: 12,
          col: 0,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "url",
              linkTemplate: "https://metabase.com",
            },
          },
        },
        {
          size_x: 12,
          col: 12,
        },
      ],
    }).then(({ dashboard }) => {
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should not trigger url click behaviors in the sdk (metabase#51099)", () => {
    // Spies to intercept opening external links.
    // See "clickLink" in frontend/src/metabase/lib/dom.js to see what we are intercepting.
    cy.window().then((win) => {
      cy.spy(win.HTMLAnchorElement.prototype, "click").as("anchorClick");
    });

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery").then(() => {
      cy.location().then((location) => {
        cy.wrap(location.pathname).as("initialPath");
      });

      const root = getSdkRoot();

      root.within(() => {
        // Table should not contain any anchor links
        H.getDashboardCard(0).get("table a").should("have.length", 0);

        // Drill-through should work on columns without click behavior
        H.getDashboardCard(0).findByText("39.72").click();
        popover().should("contain.text", "Filter by this value");

        // Drill-through should work on URL columns, which is PRODUCT_ID in this case.
        // It should open a popover, not open a new link.
        const urlCell = H.getDashboardCard(0).findByText("123");
        urlCell.should("not.have.attr", "data-testid", "link-formatted-text");
        urlCell.click();

        popover().should("contain.text", "Filter by this value");

        // URL formatting via column click behavior should not apply.
        H.getDashboardCard(0).should("not.contain.text", "Link Text Applied");
        H.getDashboardCard(0).findByText("37.65").click();
        cy.get(POPOVER_ELEMENT).should("not.exist");

        // Line chart click behavior should be disabled in the sdk
        H.getDashboardCard(1).within(() => {
          cartesianChartCircle().eq(0).click();
        });

        cy.get(POPOVER_ELEMENT).should("not.exist");
      });

      // We should never open a window in new tab in this test.
      cy.get<sinon.SinonSpy>("@anchorClick").then((clickSpy) => {
        const blankClicks = clickSpy
          .getCalls()
          .filter(
            (call: sinon.SinonSpyCall) => call.thisValue.target === "_blank",
          );

        expect(blankClicks).to.have.length(0, "should never open a new tab");
      });

      // We should never be navigated away from the current page in this test.
      cy.location().then((location) => {
        cy.get("@initialPath").should("eq", location.pathname);
      });
    });
  });

  it("show the question visualization when the user drills down (metabase#55514 - EMB-266)", () => {
    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/dataset/query_metadata").as("datasetMetadata");

    cy.get("@dashboardId").then((dashboardId) => {
      mountSdkContent(<EditableDashboard dashboardId={dashboardId} />);
    });

    getSdkRoot().within(() => {
      H.getDashboardCard(2).within(() => {
        cartesianChartCircle().eq(2).click();
      });
      H.popover().within(() => {
        cy.findByText("See these Orders").click();
      });
    });

    cy.wait(["@getCard", "@datasetMetadata"]);

    getSdkRoot().within(() => {
      cy.findByTestId("visualization-root").should("be.visible");
    });
  });

  it("columns that return a string url should be rendered as a link", () => {
    cy.get<string>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />);
    });

    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.wait("@getCard");

    cy.findByRole("link", { name: "https://example.org/448" })
      .should("have.length", 1)
      .should("have.attr", "href", "https://example.org/448");
  });

  it("columns that have 'type/URL' semantic type should be rendered as a link", () => {
    cy.signIn("admin");

    cy.get<string>("@questionId").then((questionId) => {
      // Convert question to model
      cy.request("GET", `/api/card/${questionId}`)
        .then((response) => {
          const questionData = response.body;
          return cy.request("PUT", `/api/card/${questionId}`, {
            ...questionData,
            type: "model",
          });
        })
        .then(() => {
          // re-fetch it as model
          return cy.request("GET", `/api/card/${questionId}`);
        })
        .then((modelResponse) => {
          // Update model column semantic type for url_column to type/URL

          const modelData = modelResponse.body;
          const updatedMetadata = modelData.result_metadata.map((col: any) => {
            if (col.name === "url_column") {
              return { ...col, semantic_type: "type/URL" };
            }
            return col;
          });

          return cy.request("PUT", `/api/card/${questionId}`, {
            ...modelData,
            result_metadata: updatedMetadata,
          });
        })
        .then(() => {
          // Create dashboard with the model
          H.createDashboardWithQuestions({
            dashboardName: "URL Dashboard",
            questions: [
              {
                name: "Orders with URLs",
                query: {
                  "source-table": `card__${questionId}`,
                  limit: 5,
                },
              },
            ],
          }).then(({ dashboard }) => {
            mountSdkContent(
              <InteractiveDashboard dashboardId={dashboard.id} />,
            );

            getSdkRoot().within(() => {
              H.getDashboardCard(0)
                .findByRole("link", {
                  name: "https://example.org/448",
                })
                .should("have.attr", "href", "https://example.org/448");
            });
          });
        });
    });
  });

  it("columns that have 'Display as Link' should be rendered as a link and use the custom rendering", () => {
    cy.signIn("admin");
    cy.intercept("GET", "/api/card/*").as("getCard");

    cy.get<string>("@questionId").then((questionId) => {
      H.createDashboardWithQuestions({
        dashboardName: "URL Dashboard",
        questions: [
          {
            name: "Orders with URLs",
            query: {
              "source-table": `card__${questionId}`,
              limit: 5,
            },
          },
        ],
        cards: [
          {
            visualization_settings: {
              column_settings: {
                [JSON.stringify(["name", "ID"])]: {
                  view_as: "link",
                  link_text: "Link to {{ID}}",
                  link_url: "https://example.org/{{ID}}",
                },
              },
            },
          },
        ],
      }).then(({ dashboard }) => {
        mountSdkContent(<EditableDashboard dashboardId={dashboard.id} />);

        getSdkRoot().within(() => {
          H.getDashboardCard(0)
            .findByRole("link", {
              name: "Link to 448",
            })
            .should("have.attr", "href", "https://example.org/448");
        });
      });
    });
  });
});
