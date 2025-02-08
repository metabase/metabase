import { InteractiveDashboard } from "@metabase/embedding-sdk-react";

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  POPOVER_ELEMENT,
  cartesianChartCircle,
  popover,
} from "e2e/support/helpers";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/component-testing-sdk";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > dashboard-click-behavior", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    // Make the PRODUCT_ID column a URL column for click behavior tests, to avoid having to create a new model
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/URL",
    });

    H.createDashboardWithQuestions({
      dashboardName: "Orders in a dashboard",
      questions: [
        {
          name: "Orders",
          query: { "source-table": ORDERS_ID, limit: 5 },
        },
        {
          name: "Line chart with click behavior",
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
          size_x: 12,
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
          col: 12,
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "url",
              linkTemplate: "https://metabase.com",
            },
          },
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
    cy.window().then(win => {
      cy.spy(win.HTMLAnchorElement.prototype, "click").as("anchorClick");
    });

    cy.get<string>("@dashboardId").then(dashboardId => {
      mountSdkContent(<InteractiveDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery").then(() => {
      cy.location().then(location => {
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
          cartesianChartCircle()
            .eq(0)
            .then(([circle]) => {
              const { left, top } = circle.getBoundingClientRect();
              root.click(left, top);
            });
        });

        cy.get(POPOVER_ELEMENT).should("not.exist");
      });

      // We should never open a window in new tab in this test.
      cy.get<sinon.SinonSpy>("@anchorClick").then(clickSpy => {
        const blankClicks = clickSpy
          .getCalls()
          .filter(
            (call: sinon.SinonSpyCall) => call.thisValue.target === "_blank",
          );

        expect(blankClicks).to.have.length(0, "should never open a new tab");
      });

      // We should never be navigated away from the current page in this test.
      cy.location().then(location => {
        cy.get("@initialPath").should("eq", location.pathname);
      });
    });
  });
});
