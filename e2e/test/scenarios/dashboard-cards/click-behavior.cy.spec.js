import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createActionCard,
  createHeadingCard,
  createLinkCard,
  createTextCard,
  editDashboard,
  getDashboardCard,
  modal,
  popover,
  restore,
  saveDashboard,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

const URL = "https://example.com/";
const COUNT_COLUMN_ID = "count";
const COUNT_COLUMN_NAME = "Count";
const CREATED_AT_COLUMN_ID = "CREATED_AT";
const CREATED_AT_COLUMN_NAME = "Created At";
const FILTER_NAME = "test-filter";
const FILTER_VALUE = "123";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const LINE_CHART = {
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

const OBJECT_DETAIL_CHART = {
  display: "object",
  query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
};

const POINT_COUNT = 344;
const POINT_CREATED_AT = "2026-04";
const POINT_INDEX = 48;

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("dashcards without click behavior", () => {
    it("does not allow to set click behavior for virtual dashcards", () => {
      cy.createDashboard().then(({ body: dashboard }) => {
        const textCard = createTextCard({ size_y: 1 });
        const headingCard = createHeadingCard();
        const actionCard = createActionCard();
        const linkCard = createLinkCard();
        const cards = [textCard, headingCard, actionCard, linkCard];
        updateDashboardCards({ dashboard_id: dashboard.id, cards });

        visitDashboard(dashboard.id);
        editDashboard();

        cards.forEach((card, index) => {
          const display = card.visualization_settings.virtual_card.display;
          cy.log(`does not allow to set click behavior for "${display}" card`);

          getDashboardCard(index).realHover().icon("click").should("not.exist");
        });
      });
    });

    it("does not allow to set click behavior for object detail dashcard", () => {
      cy.createQuestionAndDashboard({
        questionDetails: OBJECT_DETAIL_CHART,
      }).then(({ body: dashboard }) => {
        visitDashboard(dashboard.id);
        editDashboard();

        getDashboardCard().realHover().icon("click").should("not.exist");
      });
    });
  });

  describe("line chart", () => {
    const questionDetails = LINE_CHART;

    it("allows setting URL as custom destination", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("URL").click();
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
          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
        },
      );
    });

    it("allows setting URL with parameters as custom destination", () => {
      const urlWithParams = `${URL}{{${FILTER_NAME}}}/{{${COUNT_COLUMN_ID}}}/{{${CREATED_AT_COLUMN_ID}}}`;
      const escapedUrlWithParams = escapeCypressCurlyBraces(urlWithParams);
      const expectedUrlWithParams = urlWithParams
        .replace(`{{${COUNT_COLUMN_ID}}}`, POINT_COUNT)
        .replace(`{{${CREATED_AT_COLUMN_ID}}}`, POINT_CREATED_AT)
        .replace(`{{${FILTER_NAME}}}`, FILTER_VALUE);

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();

          addFilter();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("URL").click();
          modal().findByText("Values you can reference").click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_ID).should("exist");
            cy.findByText(CREATED_AT_COLUMN_ID).should("exist");
            cy.findByText(FILTER_NAME).should("exist");
            cy.realPress("Escape");
          });
          modal().within(() => {
            cy.findByRole("textbox").type(escapedUrlWithParams);
            cy.button("Done").click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("field-set").click();
          popover().within(() => {
            cy.findByPlaceholderText("Enter some text").type(FILTER_VALUE);
            cy.button("Add filter").click();
          });

          onNextAnchorClick(anchor => {
            expect(anchor).to.have.attr("href", expectedUrlWithParams);
            expect(anchor).to.have.attr("rel", "noopener");
            expect(anchor).to.have.attr("target", "_blank");
          });
          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
        },
      );
    });

    it("does not allow updating dashboard filters if there are none", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside")
            .findByText("Update a dashboard filter")
            .invoke("css", "pointer-events")
            .should("equal", "none");
        },
      );
    });

    it("allows updating single dashboard filter", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();

          addFilter();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Update a dashboard filter").click();
          cy.get("aside").findByText(FILTER_NAME).click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_NAME).should("exist");
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");

            cy.findByText(COUNT_COLUMN_NAME).click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();

          cy.findByTestId("field-set").should("contain.text", POINT_COUNT);
          cy.url().should("include", `?${FILTER_NAME}=${POINT_COUNT}`);
        },
      );
    });
  });
});

/**
 * @param {string} value
 * @returns string
 *
 * @see https://docs.cypress.io/api/commands/type#Arguments
 */
const escapeCypressCurlyBraces = value => value.replaceAll("{", "{{}");

/**
 * This function exists to work around custom dynamic anchor creation.
 * @see https://github.com/metabase/metabase/blob/master/frontend/src/metabase/lib/dom.js#L301-L310
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

const addFilter = () => {
  cy.icon("filter").click();
  popover().within(() => {
    cy.findByText("Text or Category").click();
    cy.findByText("Is").click();
  });
  cy.get("aside").findByLabelText("Label").clear().type(FILTER_NAME);
  cy.get("aside").button("Done").click();
};
