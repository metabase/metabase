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

import { b64hash_to_utf8 } from "metabase/lib/encoding";

const URL = "https://example.com/";
const COUNT_COLUMN_ID = "count";
const COUNT_COLUMN_NAME = "Count";
const CREATED_AT_COLUMN_ID = "CREATED_AT";
const CREATED_AT_COLUMN_NAME = "Created At";
const TEXT_FILTER_NAME = "filter-text";
const TIME_FILTER_NAME = "filter-time";
const FILTER_VALUE = "123";
const POINT_COUNT = 344;
const POINT_CREATED_AT = "2026-04";
const POINT_CREATED_AT_FORMATTED = "April 2026";
const POINT_INDEX = 48;

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const LINE_CHART = {
  name: "Line chart",
  display: "line",
  query: {
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    "source-table": ORDERS_ID,
  },
};

const OBJECT_DETAIL_CHART = {
  display: "object",
  query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
};

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

    it("allows setting saved question as custom destination", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("Saved question").click();
          modal().findByText(LINE_CHART.name).click();
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
          cy.findByText("Count by Created At: Month").should("exist");
          cy.location().should(location => {
            expect(location.pathname).to.equal("/question");
            const card = deserializeCardFromUrl(location.hash);
            expect(card.name).to.deep.equal(LINE_CHART.name);
            expect(card.display).to.deep.equal(LINE_CHART.display);
            expect(card.dataset_query.query).to.deep.equal(LINE_CHART.query);
          });
          cy.location("hash", hash => {
            const card = deserializeCardFromUrl(hash);
            expect(card.name).to.deep.equal(LINE_CHART.name);
            expect(card.display).to.deep.equal(LINE_CHART.display);
            expect(card.dataset_query.query).to.deep.equal(LINE_CHART.query);
          });
        },
      );
    });

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
      const urlWithParams = `${URL}{{${TEXT_FILTER_NAME}}}/{{${COUNT_COLUMN_ID}}}/{{${CREATED_AT_COLUMN_ID}}}`;
      const escapedUrlWithParams = escapeCypressCurlyBraces(urlWithParams);
      const expectedUrlWithParams = urlWithParams
        .replace(`{{${COUNT_COLUMN_ID}}}`, POINT_COUNT)
        .replace(`{{${CREATED_AT_COLUMN_ID}}}`, POINT_CREATED_AT)
        .replace(`{{${TEXT_FILTER_NAME}}}`, FILTER_VALUE);

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();

          addTextFilter();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("URL").click();
          modal().findByText("Values you can reference").click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_ID).should("exist");
            cy.findByText(CREATED_AT_COLUMN_ID).should("exist");
            cy.findByText(TEXT_FILTER_NAME).should("exist");
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

          addTextFilter();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Update a dashboard filter").click();
          cy.get("aside").findByText(TEXT_FILTER_NAME).click();
          popover().within(() => {
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
            cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();

          cy.findAllByTestId("field-set").should("have.length", 1);
          cy.findByTestId("field-set").should("contain.text", POINT_COUNT);
          cy.location("search").should(
            "eq",
            `?${TEXT_FILTER_NAME}=${POINT_COUNT}`,
          );
        },
      );
    });

    it("allows updating multiple dashboard filters", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: dashboard }) => {
          visitDashboard(dashboard.id);
          editDashboard();

          addTextFilter();
          addTimeFilter();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Update a dashboard filter").click();
          cy.get("aside").findByText(TEXT_FILTER_NAME).click();
          popover().within(() => {
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
            cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").findByText(TIME_FILTER_NAME).click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();

          cy.findAllByTestId("field-set").should("have.length", 2);
          cy.findAllByTestId("field-set").should("contain.text", POINT_COUNT);
          cy.findAllByTestId("field-set").should(
            "contain.text",
            POINT_CREATED_AT_FORMATTED,
          );
          cy.location("search").should(
            "eq",
            `?${TEXT_FILTER_NAME}=${POINT_COUNT}&${TIME_FILTER_NAME}=${POINT_CREATED_AT}`,
          );
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

/**
 * Duplicated from metabase/lib/card because Cypress can't handle import from there.
 *
 * @param {string} value
 * @returns string
 */
const deserializeCardFromUrl = serialized =>
  JSON.parse(b64hash_to_utf8(serialized));

const addTextFilter = () => {
  cy.icon("filter").click();
  popover().within(() => {
    cy.findByText("Text or Category").click();
    cy.findByText("Is").click();
  });
  cy.get("aside")
    .findByLabelText("Label")
    .focus()
    .clear()
    .type(TEXT_FILTER_NAME);
  cy.get("aside").button("Done").click();
};

const addTimeFilter = () => {
  cy.icon("filter").click();
  popover().within(() => {
    cy.findByText("Time").click();
    cy.findByText("Month and Year").click();
  });
  cy.get("aside")
    .findByLabelText("Label")
    .focus()
    .clear()
    .type(TIME_FILTER_NAME);
  cy.get("aside").button("Done").click();
};
