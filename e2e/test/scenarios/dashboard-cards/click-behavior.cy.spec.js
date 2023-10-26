import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createActionCard,
  createHeadingCard,
  createLinkCard,
  createTextCard,
  editDashboard,
  getBrokenUpTextMatcher,
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

const COUNT_COLUMN_ID = "count";
const COUNT_COLUMN_NAME = "Count";
const CREATED_AT_COLUMN_ID = "CREATED_AT";
const CREATED_AT_COLUMN_NAME = "Created At";
const MONTH_COLUMN_NAME = "Month";
const QUARTER_COLUMN_NAME = "Quarter";
const FILTER_VALUE = "123";
const POINT_COUNT = 79;
const POINT_CREATED_AT = "2022-08";
const POINT_CREATED_AT_FORMATTED = "August 2022";
const POINT_INDEX = 4;
const RESTRICTED_COLLECTION_NAME = "Restricted collection";
const COLUMN_INDEX = {
  CREATED_AT: 0,
  COUNT: 1,
  MONTH: 2,
  QUARTER: 3,
};

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const TARGET_DASHBOARD = {
  name: "Target dashboard",
};

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

const CREATED_AT_FIELD = [
  "field",
  CREATED_AT_COLUMN_ID,
  { "base-type": "type/DateTime" },
];

const QUESTION_TABLE = {
  name: "Table",
  display: "table",
  query: {
    "source-query": QUESTION_LINE_CHART.query,
    expressions: {
      [MONTH_COLUMN_NAME]: ["get-month", CREATED_AT_FIELD],
      [QUARTER_COLUMN_NAME]: ["get-quarter", CREATED_AT_FIELD],
    },
  },
};

const OBJECT_DETAIL_CHART = {
  display: "object",
  query: {
    "source-table": ORDERS_ID,
  },
};

const TARGET_QUESTION = {
  ...QUESTION_LINE_CHART,
  name: "Target question",
};

const DASHBOARD_FILTER_TEXT = createMockActionParameter({
  id: "1",
  name: "Text filter",
  slug: "filter-text",
  type: "string/=",
  sectionId: "string",
});

const DASHBOARD_FILTER_TIME = createMockActionParameter({
  id: "2",
  name: "Time filter",
  slug: "filter-time",
  type: "date/month-year",
  sectionId: "date",
});

const QUERY_FILTER_CREATED_AT = [
  "between",
  ["field", ORDERS.CREATED_AT, null],
  "2022-08-01",
  "2022-08-31",
];

const QUERY_FILTER_QUANTITY = [
  "=",
  ["field", ORDERS.QUANTITY, null],
  POINT_COUNT,
];

const URL = "https://example.com/";
const URL_WITH_PARAMS = `${URL}{{${DASHBOARD_FILTER_TEXT.slug}}}/{{${COUNT_COLUMN_ID}}}/{{${CREATED_AT_COLUMN_ID}}}`;
const URL_WITH_FILLED_PARAMS = URL_WITH_PARAMS.replace(
  `{{${COUNT_COLUMN_ID}}}`,
  POINT_COUNT,
)
  .replace(`{{${CREATED_AT_COLUMN_ID}}}`, POINT_CREATED_AT)
  .replace(`{{${DASHBOARD_FILTER_TEXT.slug}}}`, FILTER_VALUE);

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("dashcards without click behavior", () => {
    it("does not allow to set click behavior for virtual dashcards", () => {
      const textCard = createTextCard({ size_y: 1 });
      const headingCard = createHeadingCard();
      const actionCard = createActionCard();
      const linkCard = createLinkCard();
      const cards = [textCard, headingCard, actionCard, linkCard];

      cy.createDashboard().then(({ body: dashboard }) => {
        updateDashboardCards({ dashboard_id: dashboard.id, cards });
        visitDashboard(dashboard.id);
      });

      editDashboard();

      cards.forEach((card, index) => {
        const display = card.visualization_settings.virtual_card.display;
        cy.log(`does not allow to set click behavior for "${display}" card`);

        getDashboardCard(index).realHover().icon("click").should("not.exist");
      });
    });

    it("does not allow to set click behavior for object detail dashcard", () => {
      cy.createQuestionAndDashboard({
        questionDetails: OBJECT_DETAIL_CHART,
      }).then(({ body: card }) => {
        visitDashboard(card.dashboard_id);
      });

      editDashboard();

      getDashboardCard().realHover().icon("click").should("not.exist");
    });
  });

  describe("line chart", () => {
    const questionDetails = QUESTION_LINE_CHART;

    it("should open drill-through menu as a default click-behavior", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      clickLineChartPoint();
      assertDrillThroughMenuOpen();
    });

    it("allows setting dashboard without filters as custom destination and changing it back to default click behavior", () => {
      cy.createDashboard(TARGET_DASHBOARD, {
        wrapId: true,
        idAlias: "targetDashboardId",
      });
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside").findByText("No available targets").should("exist");
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal("");
        });
      });
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
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 1)
        .should("contain.text", POINT_COUNT);
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`,
          );
        });
      });
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
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();
      addTimeParameter();
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
          );
        });
      });
    });

    it("does not allow setting dashboard as custom destination if user has no permissions to it", () => {
      cy.createCollection({ name: RESTRICTED_COLLECTION_NAME }).then(
        ({ body: restrictedCollection }) => {
          cy.updateCollectionGraph({
            [USER_GROUPS.COLLECTION_GROUP]: {
              [restrictedCollection.id]: "none",
            },
          });

          cy.createDashboard({
            ...TARGET_DASHBOARD,
            collection_id: restrictedCollection.id,
          });
        },
      );

      cy.signOut();
      cy.signInAsNormalUser();

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Go to a custom destination").click();
      cy.get("aside").findByText("Dashboard").click();

      modal().findByText(RESTRICTED_COLLECTION_NAME).should("not.exist");
    });

    it("allows setting saved question as custom destination and changing it back to default click behavior", () => {
      cy.createQuestion(TARGET_QUESTION);
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addSavedQuestionDestination();
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.location().should(({ hash, pathname }) => {
        expect(pathname).to.equal("/question");
        const card = deserializeCardFromUrl(hash);
        expect(card.name).to.deep.equal(TARGET_QUESTION.name);
        expect(card.display).to.deep.equal(TARGET_QUESTION.display);
        expect(card.dataset_query.query).to.deep.equal(TARGET_QUESTION.query);
      });

      cy.go("back");
      testChangingBackToDefaultBehavior();
    });

    it("allows setting saved question with single parameter as custom destination", () => {
      cy.createQuestion(TARGET_QUESTION);
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addSavedQuestionDestination();
      addSavedQuestionCreatedAtParameter();
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.findByTestId("qb-filters-panel").should(
        "have.text",
        "Created At is August 1–31, 2022",
      );
      cy.location().should(({ hash, pathname }) => {
        expect(pathname).to.equal("/question");

        const card = deserializeCardFromUrl(hash);
        expect(card.name).to.deep.equal(TARGET_QUESTION.name);
        expect(card.display).to.deep.equal(TARGET_QUESTION.display);
        expect(card.dataset_query.query).to.deep.equal({
          ...TARGET_QUESTION.query,
          filter: QUERY_FILTER_CREATED_AT,
        });
      });

      cy.go("back");
      testChangingBackToDefaultBehavior();
    });

    it("allows setting saved question with multiple parameters as custom destination", () => {
      cy.createQuestion(TARGET_QUESTION);
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addSavedQuestionDestination();
      addSavedQuestionCreatedAtParameter();
      addSavedQuestionQuantityParameter();
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.findByTestId("qb-filters-panel")
        .should("contain.text", "Created At is August 1–31, 2022")
        .should("contain.text", "Quantity is equal to 79");
      cy.location().should(({ hash, pathname }) => {
        expect(pathname).to.equal("/question");
        const card = deserializeCardFromUrl(hash);
        expect(card.name).to.deep.equal(TARGET_QUESTION.name);
        expect(card.display).to.deep.equal(TARGET_QUESTION.display);
        expect(card.dataset_query.query).to.deep.equal({
          ...TARGET_QUESTION.query,
          filter: ["and", QUERY_FILTER_CREATED_AT, QUERY_FILTER_QUANTITY],
        });
      });
    });

    it("does not allow setting saved question as custom destination if user has no permissions to it", () => {
      cy.createCollection({ name: RESTRICTED_COLLECTION_NAME }).then(
        ({ body: restrictedCollection }) => {
          cy.updateCollectionGraph({
            [USER_GROUPS.COLLECTION_GROUP]: {
              [restrictedCollection.id]: "none",
            },
          });

          cy.createQuestion({
            ...TARGET_QUESTION,
            collection_id: restrictedCollection.id,
          });
        },
      );

      cy.signOut();
      cy.signInAsNormalUser();

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Go to a custom destination").click();
      cy.get("aside").findByText("Saved question").click();

      modal().findByText(RESTRICTED_COLLECTION_NAME).should("not.exist");
    });

    it("allows setting URL as custom destination and changing it back to default click behavior", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
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

      testChangingBackToDefaultBehavior();
    });

    it("allows setting URL with parameters as custom destination", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addUrlDestination();
      modal().findByText("Values you can reference").click();
      popover().within(() => {
        cy.findByText(COUNT_COLUMN_ID).should("exist");
        cy.findByText(CREATED_AT_COLUMN_ID).should("exist");
        cy.findByText(DASHBOARD_FILTER_TEXT.name).should("exist");
        cy.realPress("Escape");
      });
      modal().within(() => {
        cy.findByRole("textbox").type(URL_WITH_PARAMS, {
          parseSpecialCharSequences: false,
        });
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
        expect(anchor).to.have.attr("href", URL_WITH_FILLED_PARAMS);
        expect(anchor).to.have.attr("rel", "noopener");
        expect(anchor).to.have.attr("target", "_blank");
      });
      clickLineChartPoint();
    });

    it("does not allow updating dashboard filters if there are none", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside")
        .findByText("Update a dashboard filter")
        .invoke("css", "pointer-events")
        .should("equal", "none");
    });

    it("allows updating single dashboard filter and changing it back to default click behavior", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          cy.location().then(({ pathname }) => {
            cy.wrap(pathname).as("originalPathname");
          });
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Update a dashboard filter").click();
      addTextParameter();
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 1)
        .should("contain.text", POINT_COUNT);
      cy.get("@originalPathname").then(originalPathname => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(originalPathname);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`,
          );
        });
      });

      testChangingBackToDefaultBehavior();
    });

    it("allows updating multiple dashboard filters", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          cy.location().then(({ pathname }) => {
            cy.wrap(pathname).as("originalPathname");
          });
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Update a dashboard filter").click();
      addTextParameter();
      addTimeParameter();
      cy.get("aside").button("Done").click();

      saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
      cy.get("@originalPathname").then(originalPathname => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(originalPathname);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
          );
        });
      });
    });
  });

  describe("table", () => {
    const questionDetails = QUESTION_TABLE;
    const dashboardDetails = {
      parameters: [DASHBOARD_FILTER_TEXT],
    };

    it("allows setting custom destination for multiple columns", () => {
      cy.createQuestion(TARGET_QUESTION);
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
      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      cy.log("should open drill-through menu as a default click-behavior");
      clickTableCell(COLUMN_INDEX.COUNT);
      popover().should("contain.text", "Filter by this value");

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      getDashboardCard()
        .button()
        .should("have.text", "Open the drill-through menu");

      cy.log("custom destination (dashboard) behavior for 'Count' column");
      cy.get("aside").findByText(COUNT_COLUMN_NAME).click();
      addDashboardDestination();
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();
      addTimeParameter();

      cy.icon("chevronleft").click();

      getCountMapping().should("exist");
      getCreatedAtMapping().should("not.exist");
      getMonthMapping().should("not.exist");
      getDashboardCard()
        .button()
        .should("have.text", "1 column has custom behavior");

      cy.log("custom destination (question) behavior for 'Created at' column");
      cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).click();
      /**
       * TODO: remove the next line when metabase#34845 is fixed
       * @see https://github.com/metabase/metabase/issues/34845
       */
      cy.get("aside").findByText("Unknown").click();
      addSavedQuestionDestination();
      addSavedQuestionCreatedAtParameter();
      addSavedQuestionQuantityParameter();

      cy.icon("chevronleft").click();

      getCountMapping().should("exist");
      getCreatedAtMapping().should("exist");
      getMonthMapping().should("not.exist");
      getDashboardCard()
        .button()
        .should("have.text", "2 columns have custom behavior");

      cy.log("custom destination (URL) behavior for 'Month' column");
      cy.get("aside").findByText(MONTH_COLUMN_NAME).click();
      /**
       * TODO: remove the next line when metabase#34845 is fixed
       * @see https://github.com/metabase/metabase/issues/34845
       */
      cy.get("aside").findByText("Unknown").click();
      addUrlDestination();
      modal().within(() => {
        cy.findAllByRole("textbox").first().type(URL_WITH_PARAMS, {
          parseSpecialCharSequences: false,
        });
        cy.button("Done").click();
      });

      cy.icon("chevronleft").click();

      getCountMapping().should("exist");
      getCreatedAtMapping().should("exist");
      getMonthMapping().should("exist");
      getDashboardCard()
        .button()
        .should("have.text", "3 columns have custom behavior");

      cy.get("aside").button("Done").click();

      saveDashboard();

      cy.log("it handles 'Month' column click");
      cy.findByTestId("field-set").click();
      popover().within(() => {
        cy.findByPlaceholderText("Enter some text").type(FILTER_VALUE);
        cy.button("Add filter").click();
      });
      onNextAnchorClick(anchor => {
        expect(anchor).to.have.attr("href", URL_WITH_FILLED_PARAMS);
        expect(anchor).to.have.attr("rel", "noopener");
        expect(anchor).to.have.attr("target", "_blank");
      });
      clickTableCell(COLUMN_INDEX.MONTH);

      cy.log("it handles 'Count' column click");
      clickTableCell(COLUMN_INDEX.COUNT);
      cy.findAllByTestId("field-set")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
          );
        });
      });

      cy.go("back");

      cy.log("it handles 'Created at' column click");
      clickTableCell(COLUMN_INDEX.CREATED_AT);
      cy.findByTestId("qb-filters-panel")
        .should("contain.text", "Created At is August 1–31, 2022")
        .should("contain.text", "Quantity is equal to 79");
      cy.location().should(({ hash, pathname }) => {
        expect(pathname).to.equal("/question");
        const card = deserializeCardFromUrl(hash);
        expect(card.name).to.deep.equal(TARGET_QUESTION.name);
        expect(card.display).to.deep.equal(TARGET_QUESTION.display);
        expect(card.dataset_query.query).to.deep.equal({
          ...TARGET_QUESTION.query,
          filter: ["and", QUERY_FILTER_CREATED_AT, QUERY_FILTER_QUANTITY],
        });
      });
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

/**
 * Duplicated from metabase/lib/card because Cypress can't handle import from there.
 *
 * @param {string} value
 * @returns object
 */
const deserializeCardFromUrl = serialized =>
  JSON.parse(b64hash_to_utf8(serialized));

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

const clickTableCell = index => {
  cy.findAllByTestId("table-row")
    .eq(POINT_INDEX)
    .findAllByTestId("cell-data")
    .eq(index)
    .click();
};

const addDashboardDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("Dashboard").click();
  modal().findByText(TARGET_DASHBOARD.name).click();
};

const addUrlDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("URL").click();
};

const addSavedQuestionDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("Saved question").click();
  modal().findByText(TARGET_QUESTION.name).click();
};

const addSavedQuestionCreatedAtParameter = () => {
  cy.get("aside").findByText("Orders → Created At").click();
  popover().within(() => {
    cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist").click();
  });
};

const addSavedQuestionQuantityParameter = () => {
  cy.get("aside").findByText("Orders → Quantity").click();
  popover().within(() => {
    cy.findByText(CREATED_AT_COLUMN_NAME).should("not.exist");
    cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
  });
};

const addTextParameter = () => {
  cy.get("aside").findByText(DASHBOARD_FILTER_TEXT.name).click();
  popover().within(() => {
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
    cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
  });
};

const addTimeParameter = () => {
  cy.get("aside").findByText(DASHBOARD_FILTER_TIME.name).click();
  popover().within(() => {
    cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist").click();
  });
};

const assertDrillThroughMenuOpen = () => {
  popover()
    .should("contain", "See these Orders")
    .and("contain", "See this month by week")
    .and("contain", "Break out by…")
    .and("contain", "Automatic insights…")
    .and("contain", "Filter by this value");
};

const testChangingBackToDefaultBehavior = () => {
  cy.log("allows to change click behavior back to the default");

  editDashboard();

  getDashboardCard().realHover().icon("click").click();
  cy.get("aside").icon("close").first().click();
  cy.get("aside").findByText("Open the Metabase drill-through menu").click();
  cy.get("aside").button("Done").click();

  saveDashboard();
  // this is necessary due to query params being reset after saving dashboard
  // with filter applied, which causes dashcard to be refetched
  cy.wait(1);

  clickLineChartPoint();
  assertDrillThroughMenuOpen();
};

const getCreatedAtMapping = () => {
  return cy
    .get("aside")
    .findByText(
      getBrokenUpTextMatcher(
        `${CREATED_AT_COLUMN_NAME} goes to "${TARGET_QUESTION.name}"`,
      ),
    );
};

const getCountMapping = () => {
  return cy
    .get("aside")
    .findByText(
      getBrokenUpTextMatcher(
        `${COUNT_COLUMN_NAME} goes to "${TARGET_DASHBOARD.name}"`,
      ),
    );
};

const getMonthMapping = () => {
  return cy
    .get("aside")
    .findByText(getBrokenUpTextMatcher(`${MONTH_COLUMN_NAME} goes to URL`));
};
