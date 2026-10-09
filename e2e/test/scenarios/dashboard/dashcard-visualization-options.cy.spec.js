const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

describe("scenarios > dashboard cards > visualization options", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show the ellipsis even with an empty card title on visualizations with noHeader (metabase#46897)", () => {
    const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

    const QUESTION_LINE = {
      name: "The lineest of all lines",
      display: "line",
      query: {
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
        "source-table": ORDERS_ID,
      },
    };

    H.createQuestionAndDashboard({
      questionDetails: QUESTION_LINE,
      cardDetails: { visualization_settings: { "card.title": "" } },
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    });

    H.getDashboardCard().within(() => {
      H.echartsContainer().should("be.visible");
    });
    H.getDashboardCard().should("not.contain", QUESTION_LINE.name);
    H.getDashboardCard().realHover();
    H.getDashboardCardMenu().click();
    H.popover()
      .should("contain", "Edit question")
      .and("contain", "Download results");
  });

  it("should hide visualization options while the card loads, toggle column settings, reorder columns and allow an empty card title (metabase#21830, metabase#30966, metabase#16229, metabase#12013, metabase#36788)", () => {
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept(
      {
        method: "POST",
        url: "/api/dashboard/*/dashcard/*/card/*/query",
        middleware: true,
      },
      (req) => {
        req.on("response", (res) => {
          // throttle the response to simulate a mobile 3G connection
          res.setThrottle(100);
        });
      },
    ).as("getCardQuery");

    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    cy.wait("@getDashboard");

    cy.log("metabase#21830");
    // it's crucial that we try to click on this icon BEFORE we wait for the `getCardQuery` response!
    H.editDashboard();
    H.showDashboardCardActions();

    H.getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("not.exist");
      cy.icon("palette").should("not.exist");
    });

    cy.wait("@getCardQuery");

    H.getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("be.visible");
      cy.icon("palette").should("be.visible");
    });

    cy.log("metabase#30966");
    H.getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("Subtotal-settings-button").click();
    H.popover()
      .findByLabelText("Show a mini bar chart")
      .should("not.be.checked")
      .click({ force: true });
    H.popover().findByLabelText("Show a mini bar chart").should("be.checked");
    H.modal()
      .findAllByTestId("mini-bar-container")
      .should("have.length.above", 0);
    H.modal().button("Cancel").click();
    H.modal().should("not.exist");

    cy.log("metabase#16229");
    H.getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      H.getDraggableElements().contains("ID").as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: 100,
        useMouseEvents: true,
      });
    });
    // The ID column should be below the User ID column.
    H.getDraggableElements().should(($items) => {
      const columnNames = $items
        .toArray()
        .map((item) => item.dataset.testid.replace("draggable-item-", ""));
      expect(columnNames[0]).to.equal("User ID");
      expect(columnNames.indexOf("ID")).to.be.above(0);
    });
    // The table preview should get updated immediately, reflecting the changes in columns ordering.
    H.modal().findAllByRole("columnheader").first().contains("User ID");
    H.modal().button("Cancel").click();
    H.modal().should("not.exist");

    cy.log("metabase#12013, metabase#36788");
    const originalCardTitle = "Orders";
    cy.findByTestId("legend-caption")
      .should("contain", originalCardTitle)
      .and("be.visible");

    H.showDashboardCardActions();
    cy.icon("palette").click();

    H.modal().within(() => {
      cy.findByDisplayValue(originalCardTitle).click().clear().blur();
      cy.button("Done").click();
    });

    cy.findByTestId("legend-caption").should("not.contain", originalCardTitle);
    H.saveDashboard();
    H.getDashboardCard().realHover();
    H.getDashboardCardMenu().click();
    H.popover()
      .should("contain", "Edit question")
      .and("contain", "Download results");
  });
});
