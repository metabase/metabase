import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  getDashboardCard,
  modal,
  popover,
  restore,
  saveDashboard,
  visitDashboard,
} from "e2e/support/helpers";

const POINT_INDEX = 4;

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const QUESTION_LINE_CHART = {
  name: "Line chart",
  display: "line",
  query: {
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    "source-table": ORDERS_ID,
    limit: 5,
  },
};

const URL = "https://metabase.com/";

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("line chart", () => {
    const questionDetails = QUESTION_LINE_CHART;

    it("allows setting dashboard without filters as custom destination and changing it back to default click behavior", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          cy.window().then(win => {
            cy.spy(win.console, "error").as("consoleError");
          });
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addUrlDestination();
      modal().within(() => {
        cy.findByRole("textbox").type(URL);
        cy.button("Done").click();
      });
      cy.get("aside").button("Done").click();

      saveDashboard();

      onNextAnchorClick(anchor => {
        expect(anchor).to.have.attr("href", URL);
        expect(anchor).to.have.attr("rel", "noopener");
        expect(anchor).to.have.attr("target", "_blank");
      });
      clickLineChartPoint();

      cy.log("allows to change click behavior back to the default");

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside").icon("close").first().click();
      cy.get("aside")
        .findByText("Open the Metabase drill-through menu")
        .click();
      cy.on("uncaught:exception", err => {
        expect(
          err.message.includes(
            "Cannot read properties of undefined (reading 'type')",
          ),
        ).to.be.false;
      });

      cy.get("aside").button("Done").click();

      saveDashboard();
      // this is necessary due to query params being reset after saving dashboard
      // with filter applied, which causes dashcard to be refetched
      cy.wait(1);

      clickLineChartPoint();
      assertDrillThroughMenuOpen();
    });
  });
});

/**
 * This function exists to work around custom dynamic anchor creation.
 * @see https://github.com/metabase/metabase/blob/master/frontend/src/metabase/lib/dom.js#L301-L312
 *
 * WARNING: For the assertions to work, ensure that a click event occurs on an anchor element afterwards.
 */
const onNextAnchorClick = callback => {
  cy.window().then(window => {
    const originalClick = window.HTMLAnchorElement.prototype.click;

    window.HTMLAnchorElement.prototype.click = function () {
      callback(this);
      window.HTMLAnchorElement.prototype.click = originalClick;
    };
  });
};

const clickLineChartPoint = () => {
  cy.findByTestId("dashcard")
    .get("circle.dot")
    .eq(POINT_INDEX)
    /**
     * calling .click() here will result in clicking both
     *     g.voronoi > path[POINT_INDEX]
     * and
     *     circle.dot[POINT_INDEX]
     * To make it worse, clicks count won't be deterministic.
     * Sometimes we'll get an error that one element covers the other.
     * This problem prevails when updating dashboard filter,
     * where the 2 clicks will cancel each other out.
     **/
    .then(([circle]) => {
      const { left, top } = circle.getBoundingClientRect();
      cy.get("body").click(left, top);
    });
};

const addUrlDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("URL").click();
};

const assertDrillThroughMenuOpen = () => {
  popover()
    .should("contain", "See these Orders")
    .and("contain", "See this month by week")
    .and("contain", "Break out by…")
    .and("contain", "Automatic insights…")
    .and("contain", "Filter by this value");
};
