import {
  restore,
  visitEmbeddedPage,
  filterWidget,
  popover,
} from "__support__/e2e/cypress";

import {
  nativeQuestionDetails,
  nativeDashboardDetails,
  mapNativeDashboardParameters,
} from "./embedding-linked-filters";

describe("scenarios > embedding > dashboard > linked filters (metabase#13639, metabase#13868)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  context("SQL question with field filters", () => {
    beforeEach(() => {
      cy.createNativeQuestionAndDashboard({
        questionDetails: nativeQuestionDetails,
        dashboardDetails: nativeDashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.wrap(dashboard_id).as("dashboardId");

        mapNativeDashboardParameters({ id, card_id, dashboard_id });

        // Enable embedding for this dashboard with both the city and state filters enabled
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          embedding_params: {
            city: "enabled",
            state: "enabled",
          },
          enable_embedding: true,
        });
      });
    });

    it("works when both filters are enabled and their values are set through UI", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        visitEmbeddedPage(payload);
      });

      cy.findByRole("heading", { name: nativeDashboardDetails.name });
      cy.get(".Card").contains(nativeQuestionDetails.name);

      cy.get(".bar").should("have.length", 49);

      assertOnXYAxisLabels({ xLabel: "STATE", yLabel: "count" });

      getXAxisValues()
        .should("have.length", 49)
        .and("contain", "TX")
        .and("contain", "AK");

      openFilterOptions("State");

      popover().within(() => {
        cy.findByText("AK").click();
        cy.button("Add filter").click();
      });

      cy.location("search").should("eq", "?state=AK");

      getXAxisValues()
        .should("have.length", 1)
        .and("contain", "AK")
        .and("not.contain", "TX");

      cy.get(".bar")
        .should("have.length", 1)
        .realHover();

      popover().within(() => {
        testPairedTooltipValues("STATE", "AK");
        testPairedTooltipValues("Count", "68");
      });

      openFilterOptions("City");

      popover()
        .last()
        .within(() => {
          cy.findByPlaceholderText("Search by City").type("An");
          cy.findByText("Kiana");
          cy.findByText("Anacoco").should("not.exist");
          cy.findByText("Anchorage").click();
          cy.button("Add filter").click();
        });

      cy.location("search").should("eq", "?state=AK&city=Anchorage");

      cy.get(".bar")
        .should("have.length", 1)
        .realHover();

      popover().within(() => {
        testPairedTooltipValues("STATE", "AK");
        testPairedTooltipValues("Count", "1");
      });
    });

    it("works when main filter's value is set through URL", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        visitEmbeddedPage(payload, {
          setFilters: "state=AK",
        });
      });

      filterWidget().should("have.length", 2);

      cy.get(".bar")
        .should("have.length", 1)
        .realHover();

      popover().within(() => {
        testPairedTooltipValues("STATE", "AK");
        testPairedTooltipValues("Count", "68");
      });

      openFilterOptions("City");

      popover()
        .last()
        .within(() => {
          cy.findByPlaceholderText("Search by City").type("An");
          cy.findByText("Kiana");
          cy.findByText("Anacoco").should("not.exist");
          cy.findByText("Anchorage").click();
          cy.button("Add filter").click();
        });

      cy.location("search").should("eq", "?state=AK&city=Anchorage");

      cy.get(".bar")
        .should("have.length", 1)
        .realHover();

      popover().within(() => {
        testPairedTooltipValues("STATE", "AK");
        testPairedTooltipValues("Count", "1");
      });
    });

    it("works when main filter's value is set through URL and when it is hidden at the same time", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        const payload = {
          resource: { dashboard: dashboard_id },
          params: {},
        };

        visitEmbeddedPage(payload, {
          setFilters: "state=AK",
          hideFilters: "state",
        });
      });

      cy.get(".bar")
        .should("have.length", 1)
        .realHover();

      popover().within(() => {
        testPairedTooltipValues("STATE", "AK");
        testPairedTooltipValues("Count", "68");
      });

      filterWidget()
        .should("have.length", 1)
        .and("contain", "City")
        .click();

      popover()
        .last()
        .within(() => {
          cy.findByPlaceholderText("Search by City").type("An");
          cy.findByText("Kiana");
          cy.findByText("Anacoco").should("not.exist");
          cy.findByText("Anchorage").click();
          cy.button("Add filter").click();
        });

      cy.location("search").should("eq", "?state=AK&city=Anchorage");

      cy.get(".bar")
        .should("have.length", 1)
        .realHover();

      popover().within(() => {
        testPairedTooltipValues("STATE", "AK");
        testPairedTooltipValues("Count", "1");
      });
    });

    it("works when main filter is locked", () => {
      cy.get("@dashboardId").then(dashboard_id => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          embedding_params: {
            city: "enabled",
            state: "locked",
          },
        });

        const payload = {
          resource: { dashboard: dashboard_id },
          params: { state: ["AK"] },
        };

        visitEmbeddedPage(payload);
      });

      filterWidget()
        .should("have.length", 1)
        .and("contain", "City")
        .click();

      popover()
        .last()
        .within(() => {
          cy.findByPlaceholderText("Search by City").type("An");
          cy.findByText("Kiana");
          cy.findByText("Anacoco").should("not.exist");
          cy.findByText("Anchorage").click();
          cy.button("Add filter").click();
        });

      cy.location("search").should("eq", "?city=Anchorage");
    });
  });
});

function openFilterOptions(name) {
  filterWidget()
    .contains(name)
    .click();
}

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1)
    .closest("td")
    .siblings("td")
    .findByText(val2);
}

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  cy.get(".x-axis-label")
    .invoke("text")
    .should("eq", xLabel);

  cy.get(".y-axis-label")
    .invoke("text")
    .should("eq", yLabel);
}

function getXAxisValues() {
  return cy.get(".axis.x .tick");
}
