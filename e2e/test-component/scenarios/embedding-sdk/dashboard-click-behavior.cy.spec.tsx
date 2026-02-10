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

/**
 * NOTE: since https://github.com/metabase/metabase/pull/64623 we convert links to click behaviors,
 * so this file is almost always checking for click behaviors and not anchor tags.
 */

describe("scenarios > embedding-sdk > dashboard-click-behavior", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

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
          name: "Line chart with external URL click behavior",
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
          name: "Line chart with internal dashboard click behavior",
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
                  linkTextTemplate: "External Link",
                },
              },
              '["name","TOTAL"]': {
                click_behavior: {
                  type: "link",
                  linkType: "dashboard",
                  targetId: 1,
                  linkTextTemplate: "Internal Link (Disabled)",
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

  it("should allow external URL click behaviors in the SDK (EMB-878)", () => {
    // External click behaviour use the open() function in metabase/lib/dom creates temporary anchors and calls .click()
    // To check that we call it, we stub the anchor element click
    stubAnchorClick();

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery").then(() => {
      cy.location().then((location) => {
        // We use this to check that we're still on the same page at the end of the test,
        // if that's not the case, it means we did navigation not on a new tab, as we should have
        cy.wrap(location.pathname).as("initialPath");
      });

      getSdkRoot().within(() => {
        cy.log("Custom text for external click behavior should be applied");
        H.getDashboardCard(0)
          .findAllByText("External Link")
          .should("have.length", 5);

        cy.log(
          "Clicking on 'External Link' text should trigger external URL behavior",
        );
        H.getDashboardCard(0).findAllByText("External Link").first().click();

        cy.log("Verify that the external link logic was called");
        cy.get<sinon.SinonSpy>("@anchorClick").then((spy) => {
          expect(spy.callCount).to.be.greaterThan(0);

          const externalLinkCalls = spy
            .getCalls()
            .filter((call: any) => call.thisValue.target === "_blank");
          expect(externalLinkCalls.length).to.be.greaterThan(
            0,
            "should open external links in new tab",
          );
        });

        cy.log("Verify that we didn't open the drills popover");
        cy.get(POPOVER_ELEMENT).should("not.exist");
      });

      // Check that we didn't navigate away from the current host app page
      cy.location().then((location) => {
        cy.get("@initialPath").should("eq", location.pathname);
      });
    });
  });

  it("should disable internal dashboard/question link click behaviors in the SDK (metabase#51099)", () => {
    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery").then(() => {
      getSdkRoot().within(() => {
        // Internal dashboard link text should NOT be applied (disabled)
        // The TOTAL column should show its normal value, not "Internal Link (Disabled)"
        H.getDashboardCard(0).should(
          "not.contain.text",
          "Internal Link (Disabled)",
        );

        // Drill-through should still work on columns without click behavior
        H.getDashboardCard(0).findByText("39.72").click();
        popover().should("contain.text", "Filter by this value");

        // Line chart with internal dashboard click behavior should NOT navigate (disabled)
        // Instead, drill-through should work
        H.getDashboardCard(2).within(() => {
          cartesianChartCircle().eq(0).click();
        });

        // Should show drill-through popover since internal link was filtered out
        popover().should("contain.text", "See this Order");
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
    cy.intercept("GET", "/api/card/*").as("getCard");

    // We can't map them easily to click behaviors, so they stay as links for now
    // see https://github.com/metabase/metabase/issues/64622
    cy.get<string>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />);
    });

    cy.wait("@getCard");

    cy.findByRole("link", { name: "https://example.org/979" })
      .should("have.length", 1)
      .should("have.attr", "href", "https://example.org/979");
  });

  it("columns that have 'type/URL' semantic type should open URL via click behavior", () => {
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
            stubAnchorClick();

            mountSdkContent(
              <InteractiveDashboard dashboardId={dashboard.id} />,
            );

            getSdkRoot().within(() => {
              H.getDashboardCard(0)
                .findAllByText("https://example.org/761")
                .first()
                .click();

              expectClickBehaviorForUrl("https://example.org/761");
            });
          });
        });
    });
  });

  it("columns that have 'Display as Link' should trigger custom URL click behavior", () => {
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
        stubAnchorClick();

        mountSdkContent(<EditableDashboard dashboardId={dashboard.id} />);

        getSdkRoot().within(() => {
          H.getDashboardCard(0).findAllByText("Link to 493").first().click();

          expectClickBehaviorForUrl("https://example.org/493");
        });
      });
    });
  });

  it("links to the same domain as the host app should open in a new tab", () => {
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
                  // not super realistic, but we can't change the origin in component tests
                  link_url: `${window.location.origin}/test/{{ID}}`,
                },
              },
            },
          },
        ],
      }).then(({ dashboard }) => {
        stubAnchorClick();

        mountSdkContent(<EditableDashboard dashboardId={dashboard.id} />);

        getSdkRoot().within(() => {
          H.getDashboardCard(0).findAllByText("Link to 493").first().click();

          expectClickBehaviorForUrl(`${window.location.origin}/test/493`);
        });
      });
    });
  });
});

const stubAnchorClick = () => {
  cy.window().then((win) => {
    cy.stub(win.HTMLAnchorElement.prototype, "click").as("anchorClick");
  });
};

const expectClickBehaviorForUrl = (url: string) => {
  cy.get<sinon.SinonSpy>("@anchorClick").should((spy) => {
    expect(spy.callCount).to.be.greaterThan(0);
    const last = spy.getCalls().at(-1);
    expect(last?.thisValue.target).to.eq("_blank");
    const href = (last?.thisValue as HTMLAnchorElement).href;
    const u = new URL(href);
    expect(`${u.origin}${u.pathname}`).to.eq(url);
  });
};
