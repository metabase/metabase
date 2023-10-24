import { USER_GROUPS } from "e2e/support/cypress_data";
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

import { createMockActionParameter } from "metabase-types/api/mocks";
import { b64hash_to_utf8 } from "metabase/lib/encoding";

const URL = "https://example.com/";
const COUNT_COLUMN_ID = "count";
const COUNT_COLUMN_NAME = "Count";
const CREATED_AT_COLUMN_ID = "CREATED_AT";
const CREATED_AT_COLUMN_NAME = "Created At";
const FILTER_VALUE = "123";
const POINT_COUNT = 344;
const POINT_CREATED_AT = "2026-04";
const POINT_CREATED_AT_FORMATTED = "April 2026";
const POINT_INDEX = 48;
const RESTRICTED_COLLECTION_NAME = "Restricted collection";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const TARGET_DASHBOARD = {
  name: "Target dashboard",
};

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
  query: {
    "source-table": ORDERS_ID,
  },
};

const SECRET_QUESTION = {
  name: "Secret question",
  query: {
    "source-table": ORDERS_ID,
    limit: 5,
  },
};

const DASHBOARD_FILTER_TEXT = createMockActionParameter({
  id: "1",
  name: "filter-text",
  slug: "filter-text",
  type: "string/=",
  sectionId: "string",
});

const DASHBOARD_FILTER_TIME = createMockActionParameter({
  id: "2",
  name: "filter-time",
  slug: "filter-time",
  type: "date/month-year",
  sectionId: "date",
});

const QUERY_FILTER_CREATED_AT = [
  "between",
  ["field", ORDERS.CREATED_AT, null],
  "2026-04-01",
  "2026-04-30",
];

const QUERY_FILTER_QUANTITY = [
  "=",
  ["field", ORDERS.QUANTITY, null],
  POINT_COUNT,
];

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
      }).then(({ body: card }) => {
        visitDashboard(card.dashboard_id);
        editDashboard();

        getDashboardCard().realHover().icon("click").should("not.exist");
      });
    });
  });

  describe("line chart", () => {
    const questionDetails = LINE_CHART;

    it("allows setting dashboard as custom destination", () => {
      cy.createDashboard(TARGET_DASHBOARD, {
        wrapId: true,
        idAlias: "targetDashboardId",
      });

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("Dashboard").click();
          modal().findByText(TARGET_DASHBOARD.name).click();
          cy.get("aside").findByText("No available targets").should("exist");
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
          cy.findByText(TARGET_DASHBOARD.name).should("exist");
          cy.get("@targetDashboardId").then(targetDashboardId => {
            cy.location().should(location => {
              expect(location.pathname).to.equal(
                `/dashboard/${targetDashboardId}`,
              );
              expect(location.search).to.equal("");
            });
          });
        },
      );
    });

    it("allows setting dashboard with single parameter as custom destination", () => {
      cy.createDashboard(
        {
          ...TARGET_DASHBOARD,
          parameters: [DASHBOARD_FILTER_TEXT],
        },
        {
          wrapId: true,
          idAlias: "targetDashboardId",
        },
      );

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("Dashboard").click();
          modal().findByText(TARGET_DASHBOARD.name).click();
          cy.get("aside")
            .findByText("No available targets")
            .should("not.exist");
          cy.get("aside").findByText(DASHBOARD_FILTER_TEXT.name).click();
          popover().within(() => {
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
            cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
          cy.findByText(TARGET_DASHBOARD.name).should("exist");
          cy.get("@targetDashboardId").then(targetDashboardId => {
            cy.location().should(location => {
              expect(location.pathname).to.equal(
                `/dashboard/${targetDashboardId}`,
              );
              expect(location.search).to.equal(
                `?${DASHBOARD_FILTER_TEXT.name}=${POINT_COUNT}`,
              );
            });
          });
        },
      );
    });

    it("allows setting dashboard with multiple parameters as custom destination", () => {
      cy.createDashboard(
        {
          ...TARGET_DASHBOARD,
          parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
        },
        {
          wrapId: true,
          idAlias: "targetDashboardId",
        },
      );

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("Dashboard").click();
          modal().findByText(TARGET_DASHBOARD.name).click();
          cy.get("aside")
            .findByText("No available targets")
            .should("not.exist");
          cy.get("aside").findByText(DASHBOARD_FILTER_TEXT.name).click();
          popover().within(() => {
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
            cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").findByText(DASHBOARD_FILTER_TIME.name).click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
          cy.findByText(TARGET_DASHBOARD.name).should("exist");
          cy.get("@targetDashboardId").then(targetDashboardId => {
            cy.location().should(location => {
              expect(location.pathname).to.equal(
                `/dashboard/${targetDashboardId}`,
              );
              expect(location.search).to.equal(
                `?${DASHBOARD_FILTER_TEXT.name}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.name}=${POINT_CREATED_AT}`,
              );
            });
          });
        },
      );
    });

    it("allows setting saved question as custom destination", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
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
        },
      );
    });

    it("allows setting saved question with single parameter as custom destination", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("Saved question").click();
          modal().findByText(LINE_CHART.name).click();
          cy.get("aside").findByText("Orders → Created At").click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
          cy.findByText("Count by Created At: Month").should("exist");
          cy.findByTestId("qb-filters-panel").should(
            "have.text",
            "Created At is April 1–30, 2026",
          );
          cy.location().should(location => {
            expect(location.pathname).to.equal("/question");

            const card = deserializeCardFromUrl(location.hash);
            expect(card.name).to.deep.equal(LINE_CHART.name);
            expect(card.display).to.deep.equal(LINE_CHART.display);
            expect(card.dataset_query.query).to.deep.equal({
              ...LINE_CHART.query,
              filter: QUERY_FILTER_CREATED_AT,
            });
          });
        },
      );
    });

    it("allows setting saved question with multiple parameters as custom destination", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("Saved question").click();
          modal().findByText(LINE_CHART.name).click();
          cy.get("aside").findByText("Orders → Created At").click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").findByText("Orders → Quantity").click();
          popover().within(() => {
            cy.findByText(CREATED_AT_COLUMN_NAME).should("not.exist");
            cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").button("Done").click();

          saveDashboard();

          cy.findByTestId("dashcard").get("circle.dot").eq(POINT_INDEX).click();
          cy.findByText("Count by Created At: Month").should("exist");
          cy.findByTestId("qb-filters-panel").should(
            "contain.text",
            "Created At is April 1–30, 2026",
          );
          cy.findByTestId("qb-filters-panel").should(
            "contain.text",
            "Quantity is equal to 344",
          );
          cy.location().should(location => {
            expect(location.pathname).to.equal("/question");

            const card = deserializeCardFromUrl(location.hash);
            console.log(card);
            expect(card.name).to.deep.equal(LINE_CHART.name);
            expect(card.display).to.deep.equal(LINE_CHART.display);
            expect(card.dataset_query.query).to.deep.equal({
              ...LINE_CHART.query,
              filter: ["and", QUERY_FILTER_CREATED_AT, QUERY_FILTER_QUANTITY],
            });
          });
        },
      );
    });

    it("does not not allow setting saved question as custom destination if user has no permissions to that question", () => {
      cy.createCollection({ name: RESTRICTED_COLLECTION_NAME }).then(
        ({ body: restrictedCollection }) => {
          cy.updateCollectionGraph({
            [USER_GROUPS.COLLECTION_GROUP]: {
              [restrictedCollection.id]: "none",
            },
          });

          cy.createQuestion({
            ...SECRET_QUESTION,
            collection_id: restrictedCollection.id,
          });
        },
      );

      cy.signOut();
      cy.signInAsNormalUser();

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("Saved question").click();

          modal().findByText(RESTRICTED_COLLECTION_NAME).should("not.exist");
          modal().findByText(SECRET_QUESTION.name).should("not.exist");
        },
      );
    });

    it("allows setting URL as custom destination", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
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
      const urlWithParams = `${URL}{{${DASHBOARD_FILTER_TEXT.name}}}/{{${COUNT_COLUMN_ID}}}/{{${CREATED_AT_COLUMN_ID}}}`;
      const escapedUrlWithParams = escapeCypressCurlyBraces(urlWithParams);
      const expectedUrlWithParams = urlWithParams
        .replace(`{{${COUNT_COLUMN_ID}}}`, POINT_COUNT)
        .replace(`{{${CREATED_AT_COLUMN_ID}}}`, POINT_CREATED_AT)
        .replace(`{{${DASHBOARD_FILTER_TEXT.name}}}`, FILTER_VALUE);

      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Go to a custom destination").click();
          cy.get("aside").findByText("URL").click();
          modal().findByText("Values you can reference").click();
          popover().within(() => {
            cy.findByText(COUNT_COLUMN_ID).should("exist");
            cy.findByText(CREATED_AT_COLUMN_ID).should("exist");
            cy.findByText(DASHBOARD_FILTER_TEXT.name).should("exist");
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
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
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
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Update a dashboard filter").click();
          cy.get("aside").findByText(DASHBOARD_FILTER_TEXT.name).click();
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
            `?${DASHBOARD_FILTER_TEXT.name}=${POINT_COUNT}`,
          );
        },
      );
    });

    it("allows updating multiple dashboard filters", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          editDashboard();

          getDashboardCard().realHover().icon("click").click();
          cy.get("aside").findByText("Update a dashboard filter").click();
          cy.get("aside").findByText(DASHBOARD_FILTER_TEXT.name).click();
          popover().within(() => {
            cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
            cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
          });
          cy.get("aside").findByText(DASHBOARD_FILTER_TIME.name).click();
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
            `?${DASHBOARD_FILTER_TEXT.name}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.name}=${POINT_CREATED_AT}`,
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
 * @returns object
 */
const deserializeCardFromUrl = serialized =>
  JSON.parse(b64hash_to_utf8(serialized));
