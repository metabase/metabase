import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  addOrUpdateDashboardCard,
  chartPathWithFillColor,
  createDashboardWithTabs,
  dashboardHeader,
  editDashboard,
  getActionCardDetails,
  getDashboardCard,
  getHeadingCardDetails,
  getLinkCardDetails,
  getTextCardDetails,
  cartesianChartCircle,
  modal,
  openStaticEmbeddingModal,
  popover,
  restore,
  saveDashboard,
  setTokenFeatures,
  updateDashboardCards,
  visitDashboard,
  visitEmbeddedPage,
  visitIframe,
  entityPickerModal,
  filterWidget,
  queryBuilderHeader,
} from "e2e/support/helpers";
import { b64hash_to_utf8 } from "metabase/lib/encoding";
import {
  createMockActionParameter,
  createMockDashboardCard,
} from "metabase-types/api/mocks";
const { PRODUCTS, SAMPLE_DB_ID } = SAMPLE_DATABASE;

const COUNT_COLUMN_ID = "count";
const COUNT_COLUMN_NAME = "Count";
const COUNT_COLUMN_SOURCE = {
  type: "column",
  id: COUNT_COLUMN_ID,
  name: COUNT_COLUMN_NAME,
};
const CREATED_AT_COLUMN_ID = "CREATED_AT";
const CREATED_AT_COLUMN_NAME = "Created At";
const CREATED_AT_COLUMN_SOURCE = {
  type: "column",
  id: CREATED_AT_COLUMN_ID,
  name: CREATED_AT_COLUMN_NAME,
};
const FILTER_VALUE = "123";
const POINT_COUNT = 64;
const POINT_CREATED_AT = "2022-07";
const POINT_CREATED_AT_FORMATTED = "July 2022";
const POINT_INDEX = 3;
const RESTRICTED_COLLECTION_NAME = "Restricted collection";
const COLUMN_INDEX = {
  CREATED_AT: 0,
  COUNT: 1,
};

// these ids aren't real, but you have to provide unique ids 🙄
const FIRST_TAB = { id: 900, name: "first" };
const SECOND_TAB = { id: 901, name: "second" };
const THIRD_TAB = { id: 902, name: "third" };

const { ORDERS_ID, ORDERS, PEOPLE } = SAMPLE_DATABASE;

const TARGET_DASHBOARD = {
  name: "Target dashboard",
};

const QUESTION_LINE_CHART = {
  name: "Line chart",
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
    limit: 5,
  },
};

const QUESTION_TABLE = {
  name: "Table",
  display: "table",
  query: QUESTION_LINE_CHART.query,
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

const DASHBOARD_FILTER_NUMBER = createMockActionParameter({
  id: "3",
  name: "Number filter",
  slug: "filter-number",
  type: "number/>=",
  sectionId: "number",
});

const QUERY_FILTER_CREATED_AT = [
  "between",
  [
    "field",
    ORDERS.CREATED_AT,
    {
      "base-type": "type/DateTime",
    },
  ],
  "2022-07-01",
  "2022-07-31",
];

const QUERY_FILTER_QUANTITY = [
  "=",
  ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
  POINT_COUNT,
];

const URL = "https://metabase.com/";
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
    cy.intercept("/api/dataset").as("dataset");
    setTokenFeatures("all");
  });

  describe("dashcards without click behavior", () => {
    it("does not allow to set click behavior for virtual dashcards", () => {
      const textCard = getTextCardDetails({ size_y: 1 });
      const headingCard = getHeadingCardDetails({ text: "Heading card" });
      const actionCard = getActionCardDetails();
      const linkCard = getLinkCardDetails();
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

      cy.log("doesn't throw when setting default behavior (metabase#35354)");
      cy.on("uncaught:exception", err => {
        expect(err.name.includes("TypeError")).to.be.false;
      });

      getDashboardCard().realHover().icon("click").click();

      // When the default menu is selected, it should've visual cue (metabase#34848)
      cy.get("aside")
        .findByText("Open the Metabase drill-through menu")
        .parent()
        .parent()
        .should("have.attr", "aria-selected", "true")
        .should("have.css", "background-color", "rgb(80, 158, 227)");

      addDashboardDestination();
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").findByText("No available targets").should("exist");
      cy.get("aside").button("Done").click();

      saveDashboard({ waitMs: 250 });

      cy.intercept(
        "GET",
        "/api/collection/root",
        cy.spy().as("rootCollection"),
      );
      cy.intercept("GET", "/api/collection", cy.spy().as("collections"));

      clickLineChartPoint();
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal("");
        });
      });

      cy.log("Should navigate to question using router (metabase#33379)");
      dashboardHeader().findByText(TARGET_DASHBOARD.name).should("be.visible");
      // If the page was reloaded, many API request would have been made and theses
      // calls are 2 of those.
      cy.get("@rootCollection").should("not.have.been.called");
      cy.get("@collections").should("not.have.been.called");
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
      ).then(dashboardId => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          dashcards: [
            createMockDashboardCard({
              card_id: ORDERS_QUESTION_ID,
              parameter_mappings: [
                createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              ],
            }),
          ],
        });
      });

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();
      cy.get("aside").button("Done").click();

      saveDashboard({ waitMs: 250 });

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
      ).then(dashboardId => {
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          dashcards: [
            createMockDashboardCard({
              card_id: ORDERS_QUESTION_ID,
              parameter_mappings: [
                createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
                createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              ],
            }),
          ],
        });
      });

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();
      addTimeParameter();
      cy.get("aside").button("Done").click();

      saveDashboard({ waitMs: 250 });

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

    it("allows setting dashboard tab with parameter as custom destination", () => {
      const dashboard = {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT],
      };

      const tabs = [FIRST_TAB, SECOND_TAB, THIRD_TAB];

      const options = {
        wrapId: true,
        idAlias: "targetDashboardId",
      };

      createDashboardWithTabsLocal({
        dashboard,
        tabs,
        dashcards: [
          createMockDashboardCard({
            dashboard_tab_id: SECOND_TAB.id,
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
        options,
      });

      const TAB_SLUG_MAP = {};

      tabs.forEach(tab => {
        cy.get(`@${tab.name}-id`).then(tabId => {
          TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
        });
      });

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
          cy.wrap(card.dashboard_id).as("dashboardId");
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("have.value", FIRST_TAB.name)
        .click();
      cy.findByRole("listbox").findByText(SECOND_TAB.name).click();
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();
      cy.get("aside").button("Done").click();

      saveDashboard({ waitMs: 250 });

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 1)
        .should("contain.text", POINT_COUNT);
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?tab=${TAB_SLUG_MAP[SECOND_TAB.name]}&${
              DASHBOARD_FILTER_TEXT.slug
            }=${POINT_COUNT}`,
          );
        });
      });
    });

    it("should show error and disable the form after target dashboard tab has been removed and there is more than 1 tab left", () => {
      const options = {
        wrapId: true,
        idAlias: "targetDashboardId",
      };
      const tabs = [FIRST_TAB, SECOND_TAB, THIRD_TAB];

      createDashboardWithTabsLocal({
        dashboard: TARGET_DASHBOARD,
        tabs,
        options,
      });

      const TAB_SLUG_MAP = {};
      tabs.forEach(tab => {
        cy.get(`@${tab.name}-id`).then(tabId => {
          TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
        });
      });

      cy.get("@targetDashboardId").then(targetDashboardId => {
        const inexistingTabId = 999;
        const cardDetails = {
          visualization_settings: {
            click_behavior: {
              parameterMapping: {},
              targetId: targetDashboardId,
              tabId: inexistingTabId,
              linkType: "dashboard",
              type: "link",
            },
          },
        };
        cy.createQuestionAndDashboard({
          questionDetails,
          cardDetails,
        }).then(({ body: card }) => {
          visitDashboard(card.dashboard_id);
        });
      });

      editDashboard();
      getDashboardCard().realHover().icon("click").click();

      cy.get("aside")
        .findByText("The selected tab is no longer available")
        .should("exist");
      cy.button("Done").should("be.disabled");

      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("not.have.value")
        .click();
      cy.findByRole("listbox").findByText(SECOND_TAB.name).click();

      cy.get("aside")
        .findByText("The selected tab is no longer available")
        .should("not.exist");
      cy.button("Done").should("be.enabled").click();

      saveDashboard({ waitMs: 250 });

      clickLineChartPoint();
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(`?tab=${TAB_SLUG_MAP[SECOND_TAB.name]}`);
        });
      });
    });

    it("should fall back to the first tab after target dashboard tab has been removed and there is only 1 tab left", () => {
      cy.createDashboard(TARGET_DASHBOARD, {
        wrapId: true,
        idAlias: "targetDashboardId",
      });
      cy.get("@targetDashboardId").then(targetDashboardId => {
        const inexistingTabId = 999;
        const cardDetails = {
          visualization_settings: {
            click_behavior: {
              parameterMapping: {},
              targetId: targetDashboardId,
              tabId: inexistingTabId,
              linkType: "dashboard",
              type: "link",
            },
          },
        };
        cy.createQuestionAndDashboard({
          questionDetails,
          cardDetails,
        }).then(({ body: card }) => {
          visitDashboard(card.dashboard_id);
        });
      });

      editDashboard();
      getDashboardCard().realHover().icon("click").click();
      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("not.exist");
      cy.button("Done").should("be.enabled").click();
      saveDashboard({ waitMs: 250 });

      clickLineChartPoint();
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal("");
        });
      });
    });

    it("dashboard click behavior works without tabId previously saved", () => {
      const tabs = [FIRST_TAB, SECOND_TAB, THIRD_TAB];

      const options = {
        wrapId: true,
        idAlias: "targetDashboardId",
      };

      createDashboardWithTabsLocal({
        dashboard: TARGET_DASHBOARD,
        tabs,
        options,
      });

      const TAB_SLUG_MAP = {};
      tabs.forEach(tab => {
        cy.get(`@${tab.name}-id`).then(tabId => {
          TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
        });
      });

      cy.get("@targetDashboardId").then(targetDashboardId => {
        const cardDetails = {
          visualization_settings: {
            click_behavior: {
              parameterMapping: {},
              targetId: targetDashboardId,
              tabId: undefined,
              linkType: "dashboard",
              type: "link",
            },
          },
        };
        cy.createQuestionAndDashboard({
          questionDetails,
          cardDetails,
        }).then(({ body: card }) => {
          visitDashboard(card.dashboard_id);
          cy.wrap(card.dashboard_id).as("dashboardId");
        });
      });

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("have.value", FIRST_TAB.name);
      cy.get("header").button("Cancel").click();
      // migrateUndefinedDashboardTabId causes detection of changes even though user did not change anything
      modal().button("Discard changes").click();
      cy.button("Cancel").should("not.exist");

      clickLineChartPoint();
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(`?tab=${TAB_SLUG_MAP[FIRST_TAB.name]}`);
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
      cy.createQuestion(TARGET_QUESTION, { wrapId: true });
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      addSavedQuestionDestination();
      cy.get("aside").button("Done").click();

      saveDashboard({ waitMs: 250 });

      cy.intercept(
        "GET",
        "/api/collection/root",
        cy.spy().as("rootCollection"),
      );
      cy.intercept("GET", "/api/collection", cy.spy().as("collections"));

      clickLineChartPoint();
      cy.get("@questionId").then(questionId => {
        cy.location()
          .its("pathname")
          .should("contain", `/question/${questionId}`);
      });
      queryBuilderHeader()
        .findByDisplayValue(TARGET_QUESTION.name)
        .should("be.visible");

      cy.log("Should navigate to question using router (metabase#33379)");
      cy.findByTestId("view-footer").should("contain", "Showing 5 rows");
      // If the page was reloaded, many API request would have been made and theses
      // calls are 2 of those.
      cy.get("@rootCollection").should("not.have.been.called");
      cy.get("@collections").should("not.have.been.called");

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

      saveDashboard({ waitMs: 250 });

      clickLineChartPoint();
      cy.findByTestId("qb-filters-panel").should(
        "have.text",
        "Created At is Jul 1–31, 2022",
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

      saveDashboard({ waitMs: 250 });

      clickLineChartPoint();
      cy.wait("@dataset");
      cy.findByTestId("qb-filters-panel")
        .should("contain.text", "Created At is Jul 1–31, 2022")
        .should("contain.text", "Quantity is equal to 64");
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

      saveDashboard({ waitMs: 250 });

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
        ({ body: dashcard }) => {
          addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createTextFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          visitDashboard(dashcard.dashboard_id);
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

      saveDashboard({ waitMs: 250 });

      cy.button(DASHBOARD_FILTER_TEXT.name).click();
      popover().within(() => {
        cy.findByPlaceholderText("Search by Name").type("Dell Adams");
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
        parameters: [DASHBOARD_FILTER_NUMBER],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createNumberFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          visitDashboard(dashcard.dashboard_id);
          cy.location().then(({ pathname }) => {
            cy.wrap(pathname).as("originalPathname");
          });
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Update a dashboard filter").click();
      addNumericParameter();
      cy.get("aside").button("Done").click();

      saveDashboard({ waitMs: 250 });

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 1)
        .should("contain.text", POINT_COUNT);
      cy.get("@originalPathname").then(originalPathname => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(originalPathname);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_NUMBER.slug}=${POINT_COUNT}`,
          );
        });
      });

      cy.log("reset filter state");

      filterWidget().icon("close").click();

      testChangingBackToDefaultBehavior();
    });

    it("behavior is updated after linked dashboard filter has been removed", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createTextFilterMapping({ card_id: dashcard.card_id }),
                createTimeFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          visitDashboard(dashcard.dashboard_id);
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
      cy.get("aside")
        .should("contain.text", DASHBOARD_FILTER_TEXT.name)
        .should("contain.text", COUNT_COLUMN_NAME);
      cy.get("aside").button("Done").click();

      saveDashboard({ waitMs: 250 });

      editDashboard();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText(DASHBOARD_FILTER_TEXT.name)
        .click();
      cy.get("aside").button("Remove").click();

      saveDashboard({ waitMs: 250 });

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 1)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
      cy.get("@originalPathname").then(originalPathname => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(originalPathname);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
          );
        });
      });

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside")
        .should("not.contain.text", DASHBOARD_FILTER_TEXT.name)
        .should("not.contain.text", COUNT_COLUMN_NAME);
    });

    it("allows updating multiple dashboard filters", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createTextFilterMapping({ card_id: dashcard.card_id }),
                createTimeFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          visitDashboard(dashcard.dashboard_id);
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

      saveDashboard({ waitMs: 250 });

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

    it("should open drill-through menu as a default click-behavior", () => {
      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      getTableCell(COLUMN_INDEX.COUNT).click();
      popover().should("contain.text", "Filter by this value");

      getTableCell(COLUMN_INDEX.CREATED_AT).click();
      popover().should("contain.text", "Filter by this date");

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      getDashboardCard()
        .button()
        .should("have.text", "Open the drill-through menu");
    });

    it("should allow setting dashboard and saved question as custom destination for different columns", () => {
      cy.createQuestion(TARGET_QUESTION);
      cy.createDashboard(
        {
          ...TARGET_DASHBOARD,
          parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
          dashcards: [
            createMockDashboardCard({
              card_id: ORDERS_QUESTION_ID,
              parameter_mappings: [
                createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
                createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              ],
            }),
          ],
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

      (function addCustomDashboardDestination() {
        cy.log("custom destination (dashboard) behavior for 'Count' column");

        getCountToDashboardMapping().should("not.exist");
        cy.get("aside").findByText(COUNT_COLUMN_NAME).click();
        addDashboardDestination();
        cy.get("aside")
          .findByText("Select a dashboard tab")
          .should("not.exist");
        cy.get("aside").findByText("No available targets").should("not.exist");
        addTextParameter();
        addTimeParameter();
        cy.get("aside")
          .findByRole("textbox")
          .type(`Count: {{${COUNT_COLUMN_ID}}}`, {
            parseSpecialCharSequences: false,
          });

        cy.icon("chevronleft").click();

        getCountToDashboardMapping().should("exist");
        getDashboardCard()
          .button()
          .should("have.text", "1 column has custom behavior");
      })();

      (function addCustomQuestionDestination() {
        cy.log(
          "custom destination (question) behavior for 'Created at' column",
        );

        getCreatedAtToQuestionMapping().should("not.exist");
        cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).click();
        addSavedQuestionDestination();
        addSavedQuestionCreatedAtParameter();
        addSavedQuestionQuantityParameter();
        cy.get("aside")
          .findByRole("textbox")
          .type(`Created at: {{${CREATED_AT_COLUMN_ID}}}`, {
            parseSpecialCharSequences: false,
          });

        cy.icon("chevronleft").click();

        getCreatedAtToQuestionMapping().should("exist");
        getDashboardCard()
          .button()
          .should("have.text", "2 columns have custom behavior");
      })();

      cy.get("aside").button("Done").click();
      saveDashboard({ waitMs: 250 });

      (function testDashboardDestinationClick() {
        cy.log("it handles 'Count' column click");

        getTableCell(COLUMN_INDEX.COUNT)
          .should("have.text", `Count: ${POINT_COUNT}`)
          .click();
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
      })();

      cy.go("back");

      (function testQuestionDestinationClick() {
        cy.log("it handles 'Created at' column click");

        getTableCell(COLUMN_INDEX.CREATED_AT)
          .should("have.text", `Created at: ${POINT_CREATED_AT_FORMATTED}`)
          .click();
        cy.wait("@dataset");
        cy.findByTestId("qb-filters-panel")
          .should("contain.text", "Created At is Jul 1–31, 2022")
          .should("contain.text", "Quantity is equal to 64");
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
      })();
    });

    it("should allow setting dashboard tab with parameter for a column", () => {
      cy.createQuestion(TARGET_QUESTION);

      const dashboard = {
        ...TARGET_DASHBOARD,
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      const tabs = [FIRST_TAB, SECOND_TAB, THIRD_TAB];

      const options = {
        wrapId: true,
        idAlias: "targetDashboardId",
      };

      createDashboardWithTabsLocal({
        dashboard,
        tabs,
        dashcards: [
          createMockDashboardCard({
            dashboard_tab_id: SECOND_TAB.id,
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
            ],
          }),
        ],
        options,
      });

      const TAB_SLUG_MAP = {};
      tabs.forEach(tab => {
        cy.get(`@${tab.name}-id`).then(tabId => {
          TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
        });
      });

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          visitDashboard(card.dashboard_id);
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText(COUNT_COLUMN_NAME).click();
      addDashboardDestination();
      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("have.value", FIRST_TAB.name)
        .click();
      cy.findByRole("listbox").findByText(SECOND_TAB.name).click();
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();

      cy.icon("chevronleft").click();

      getCountToDashboardMapping().should("exist");
      getDashboardCard()
        .button()
        .should("have.text", "1 column has custom behavior");

      cy.get("aside").button("Done").click();
      saveDashboard({ waitMs: 250 });

      getTableCell(COLUMN_INDEX.COUNT)
        .should("have.text", String(POINT_COUNT))
        .click();
      cy.findAllByTestId("field-set")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT);

      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?tab=${TAB_SLUG_MAP[SECOND_TAB.name]}&${
              DASHBOARD_FILTER_TEXT.slug
            }=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=`,
          );
        });
      });
    });

    it("should allow setting URL as custom destination and updating dashboard filters for different columns", () => {
      cy.createQuestion(TARGET_QUESTION);
      cy.createDashboard(
        {
          ...TARGET_DASHBOARD,
          parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
          dashcards: [
            createMockDashboardCard({
              card_id: ORDERS_QUESTION_ID,
              parameter_mappings: [
                createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
                createTimeFilterMapping({ card_id: ORDERS_QUESTION_ID }),
              ],
            }),
          ],
        },
        {
          wrapId: true,
          idAlias: "targetDashboardId",
        },
      );
      cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createTextFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          visitDashboard(dashcard.dashboard_id);
          cy.location().then(({ pathname }) => {
            cy.wrap(pathname).as("originalPathname");
          });
        },
      );

      editDashboard();

      getDashboardCard().realHover().icon("click").click();

      (function addUpdateDashboardFilters() {
        cy.log("update dashboard filters behavior for 'Count' column");

        getCountToDashboardFilterMapping().should("not.exist");
        cy.get("aside").findByText(COUNT_COLUMN_NAME).click();
        cy.get("aside").findByText("Update a dashboard filter").click();
        addTextParameter();
        cy.get("aside").findByRole("textbox").should("not.exist");

        cy.icon("chevronleft").click();

        getCountToDashboardFilterMapping().should("exist");
      })();

      getDashboardCard()
        .button()
        .should("have.text", "1 column has custom behavior");

      (function addCustomUrlDestination() {
        cy.log("custom destination (URL) behavior for 'Created At' column");

        getCreatedAtToUrlMapping().should("not.exist");
        cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).click();
        addUrlDestination();
        modal().within(() => {
          const urlInput = cy.findAllByRole("textbox").eq(0);
          const customLinkTextInput = cy.findAllByRole("textbox").eq(1);
          urlInput.type(URL_WITH_PARAMS, {
            parseSpecialCharSequences: false,
          });
          customLinkTextInput.type(`Created at: {{${CREATED_AT_COLUMN_ID}}}`, {
            parseSpecialCharSequences: false,
          });
          cy.button("Done").click();
        });

        cy.icon("chevronleft").click();

        getCreatedAtToUrlMapping().should("exist");
      })();

      getDashboardCard()
        .button()
        .should("have.text", "2 columns have custom behavior");

      cy.get("aside").button("Done").click();
      saveDashboard({ waitMs: 250 });

      (function testUpdateDashboardFiltersClick() {
        cy.log("it handles 'Count' column click");

        getTableCell(COLUMN_INDEX.COUNT).click();
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
      })();

      (function testCustomUrlDestinationClick() {
        cy.log("it handles 'Created at' column click");

        cy.button(DASHBOARD_FILTER_TEXT.name).click();
        popover().within(() => {
          cy.icon("close").click();
          cy.findByPlaceholderText("Search by Name").type("Dell Adams");
          cy.button("Update filter").click();
        });
        onNextAnchorClick(anchor => {
          expect(anchor).to.have.attr("href", URL_WITH_FILLED_PARAMS);
          expect(anchor).to.have.attr("rel", "noopener");
          expect(anchor).to.have.attr("target", "_blank");
        });
        getTableCell(COLUMN_INDEX.CREATED_AT)
          .should("have.text", "Created at: October 2023")
          .click();
      })();
    });
  });

  describe("interactive embedding", () => {
    const questionDetails = QUESTION_LINE_CHART;

    beforeEach(() => {
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
    });

    it("does not allow opening custom dashboard destination", () => {
      const dashboardDetails = {
        enable_embedding: true,
        embedding_params: {},
      };

      cy.createDashboard(
        {
          ...TARGET_DASHBOARD,
          enable_embedding: true,
          embedding_params: {},
        },
        {
          wrapId: true,
          idAlias: "targetDashboardId",
        },
      );
      cy.get("@targetDashboardId").then(targetDashboardId => {
        cy.createQuestionAndDashboard({
          questionDetails,
          dashboardDetails,
        }).then(({ body: card }) => {
          addOrUpdateDashboardCard({
            dashboard_id: card.dashboard_id,
            card_id: card.card_id,
            card: {
              id: card.id,
              visualization_settings: {
                click_behavior: {
                  parameterMapping: {},
                  targetId: targetDashboardId,
                  linkType: "dashboard",
                  type: "link",
                },
              },
            },
          });

          visitEmbeddedPage({
            resource: { dashboard: card.dashboard_id },
            params: {},
          });
          cy.wait("@dashboard");
          cy.wait("@cardQuery");
        });
      });

      cy.url().then(originalUrl => {
        clickLineChartPoint();
        cy.url().should("eq", originalUrl);
      });
      cy.get("header").findByText(TARGET_DASHBOARD.name).should("not.exist");
    });

    it("does not allow opening custom question destination", () => {
      const dashboardDetails = {
        enable_embedding: true,
        embedding_params: {},
      };

      cy.createQuestion(
        {
          ...TARGET_QUESTION,
          enable_embedding: true,
          embedding_params: {},
        },
        {
          wrapId: true,
          idAlias: "targetQuestionId",
        },
      );
      cy.get("@targetQuestionId").then(targetQuestionId => {
        cy.createQuestionAndDashboard({
          questionDetails,
          dashboardDetails,
        }).then(({ body: card }) => {
          addOrUpdateDashboardCard({
            dashboard_id: card.dashboard_id,
            card_id: card.card_id,
            card: {
              id: card.id,
              visualization_settings: {
                click_behavior: {
                  parameterMapping: {},
                  targetId: targetQuestionId,
                  linkType: "question",
                  type: "link",
                },
              },
            },
          });

          visitEmbeddedPage({
            resource: { dashboard: card.dashboard_id },
            params: {},
          });
          cy.wait("@dashboard");
          cy.wait("@cardQuery");
        });
      });

      cy.url().then(originalUrl => {
        clickLineChartPoint();
        cy.url().should("eq", originalUrl);
      });
      cy.get("header").findByText(TARGET_QUESTION.name).should("not.exist");
    });

    it("allows opening custom URL destination with parameters", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
        enable_embedding: true,
        embedding_params: {
          [DASHBOARD_FILTER_TEXT.slug]: "enabled",
        },
      };

      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: dashCard }) => {
        addOrUpdateDashboardCard({
          dashboard_id: dashCard.dashboard_id,
          card_id: dashCard.card_id,
          card: {
            id: dashCard.id,
            parameter_mappings: [
              createTextFilterMapping({ card_id: dashCard.card_id }),
            ],
            visualization_settings: {
              click_behavior: {
                type: "link",
                linkType: "url",
                linkTemplate: URL_WITH_PARAMS,
              },
            },
          },
        });

        visitEmbeddedPage({
          resource: { dashboard: dashCard.dashboard_id },
          params: {},
        });
        cy.wait("@dashboard");
        cy.wait("@cardQuery");
      });

      cy.button(DASHBOARD_FILTER_TEXT.name).click();
      popover().within(() => {
        cy.findByPlaceholderText("Search by Name").type("Dell Adams");
        cy.button("Add filter").click();
      });
      onNextAnchorClick(anchor => {
        expect(anchor).to.have.attr("href", URL_WITH_FILLED_PARAMS);
        expect(anchor).to.have.attr("rel", "noopener");
        expect(anchor).to.have.attr("target", "_blank");
      });
      clickLineChartPoint();
    });

    it("allows opening custom URL destination that is not a Metabase instance URL using link (metabase#33379)", () => {
      cy.request("PUT", "/api/setting/site-url", {
        value: "https://localhost:4000/subpath",
      });
      const dashboardDetails = {
        enable_embedding: true,
      };

      const metabaseInstanceUrl = "http://localhost:4000";
      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        addOrUpdateDashboardCard({
          dashboard_id: card.dashboard_id,
          card_id: card.card_id,
          card: {
            id: card.id,
            visualization_settings: {
              click_behavior: {
                type: "link",
                linkType: "url",
                linkTemplate: `${metabaseInstanceUrl}/404`,
              },
            },
          },
        });

        visitEmbeddedPage({
          resource: { dashboard: card.dashboard_id },
          params: {},
        });
        cy.wait("@dashboard");
        cy.wait("@cardQuery");
      });

      clickLineChartPoint();

      cy.log(
        "This is app 404 page, the embed 404 page will have different copy",
      );
      cy.findByRole("main")
        .findByText("The page you asked for couldn't be found.")
        .should("be.visible");
    });

    it("allows updating multiple dashboard filters", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
        enable_embedding: true,
        embedding_params: {
          [DASHBOARD_FILTER_TEXT.slug]: "enabled",
          [DASHBOARD_FILTER_TIME.slug]: "enabled",
        },
      };
      const countParameterId = "1";
      const createdAtParameterId = "2";

      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: dashCard }) => {
        addOrUpdateDashboardCard({
          dashboard_id: dashCard.dashboard_id,
          card_id: dashCard.card_id,
          card: {
            id: dashCard.id,
            parameter_mappings: [
              createTextFilterMapping({ card_id: dashCard.card_id }),
              createTimeFilterMapping({ card_id: dashCard.card_id }),
            ],
            visualization_settings: {
              click_behavior: {
                type: "crossfilter",
                parameterMapping: {
                  [countParameterId]: {
                    source: COUNT_COLUMN_SOURCE,
                    target: { type: "parameter", id: countParameterId },
                    id: countParameterId,
                  },
                  [createdAtParameterId]: {
                    source: CREATED_AT_COLUMN_SOURCE,
                    target: { type: "parameter", id: createdAtParameterId },
                    id: createdAtParameterId,
                  },
                },
              },
            },
          },
        });

        visitEmbeddedPage({
          resource: { dashboard: dashCard.dashboard_id },
          params: {},
        });
        cy.wait("@dashboard");
        cy.wait("@cardQuery");
      });

      clickLineChartPoint();
      cy.findAllByTestId("field-set")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
    });
  });

  describe("static embedding", () => {
    it("should navigate to public link URL (metabase#38640)", () => {
      cy.createDashboard(TARGET_DASHBOARD)
        .then(({ body: { id: dashboardId } }) => {
          cy.log("create a public link for this dashboard");
          cy.request("POST", `/api/dashboard/${dashboardId}/public_link`).then(
            ({ body: { uuid } }) => {
              cy.wrap(uuid);
            },
          );
        })
        .then(uuid => {
          cy.createQuestionAndDashboard({
            dashboardDetails: {
              name: "Dashboard",
              enable_embedding: true,
            },
            questionDetails: QUESTION_LINE_CHART,
            cardDetails: {
              // Set custom URL click behavior via API
              visualization_settings: {
                click_behavior: {
                  type: "link",
                  linkType: "url",
                  linkTemplate: `http://localhost:4000/public/dashboard/${uuid}`,
                },
              },
            },
          });
        })
        .then(({ body: dashCard }) => {
          visitDashboard(dashCard.dashboard_id);
        });

      openStaticEmbeddingModal({
        activeTab: "parameters",
        acceptTerms: false,
      });
      visitIframe();
      clickLineChartPoint();

      cy.findByRole("heading", { name: TARGET_DASHBOARD.name }).should(
        "be.visible",
      );
    });
  });

  it("should navigate to a different tab on the same dashboard when configured (metabase#39319)", () => {
    const TAB_1 = {
      id: 1,
      name: "first-tab",
    };
    const TAB_2 = {
      id: 2,
      name: "second-tab",
    };
    const tabs = [TAB_1, TAB_2];
    const FILTER_MAPPING_COLUMN = "User ID";
    const DASHBOARD_TEXT_FILTER = {
      id: "1",
      name: "Text filter",
      slug: "filter-text",
      type: "string/contains",
    };

    createDashboardWithTabs({
      name: TARGET_DASHBOARD.name,
      tabs,
      parameters: [{ ...DASHBOARD_TEXT_FILTER }],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          size_x: 12,
          size_y: 6,
          dashboard_tab_id: TAB_1.id,
          parameter_mappings: [
            createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
          ],
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_BY_YEAR_QUESTION_ID,
          size_x: 12,
          size_y: 6,
          dashboard_tab_id: TAB_2.id,
          parameter_mappings: [
            createTextFilterMapping({ card_id: ORDERS_BY_YEAR_QUESTION_ID }),
          ],
        }),
      ],
    }).then(dashboard => {
      cy.wrap(dashboard.id).as("targetDashboardId");
      dashboard.tabs.forEach(tab => {
        cy.wrap(tab.id).as(`${tab.name}-id`);
      });
      visitDashboard(dashboard.id);
    });

    const TAB_SLUG_MAP = {};
    tabs.forEach(tab => {
      cy.get(`@${tab.name}-id`).then(tabId => {
        TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
      });
    });

    editDashboard();

    getDashboardCard().realHover().icon("click").click();
    cy.get("aside").findByText(FILTER_MAPPING_COLUMN).click();
    addDashboardDestination();
    cy.get("aside")
      .findByLabelText("Select a dashboard tab")
      .should("have.value", TAB_1.name)
      .click();
    cy.findByRole("listbox").findByText(TAB_2.name).click();
    cy.get("aside").findByText(DASHBOARD_TEXT_FILTER.name).click();
    popover().findByText(FILTER_MAPPING_COLUMN).click();

    cy.get("aside").button("Done").click();
    saveDashboard({ waitMs: 250 });

    // test click behavior routing to same dashboard, different tab
    getTableCell(1).click();
    cy.get("@targetDashboardId").then(targetDashboardId => {
      cy.location().should(({ pathname, search }) => {
        expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
        expect(search).to.equal(
          `?tab=${TAB_SLUG_MAP[TAB_2.name]}&${DASHBOARD_FILTER_TEXT.slug}=${1}`,
        );
      });
    });
  });

  it("should allow click behavior on left/top header rows on a pivot table (metabase#25203)", () => {
    const QUESTION_NAME = "Cypress Pivot Table";
    const DASHBOARD_NAME = "Pivot Table Dashboard";
    const testQuery = {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.SOURCE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
      },
      database: SAMPLE_DB_ID,
    };

    cy.createQuestionAndDashboard({
      questionDetails: {
        name: QUESTION_NAME,
        query: testQuery.query,
        display: "pivot",
      },
      dashboardDetails: {
        name: DASHBOARD_NAME,
      },
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("targetDashboardId");
      visitDashboard(dashboard_id);
    });

    editDashboard();

    getDashboardCard().realHover().icon("click").click();
    addUrlDestination();

    modal().within(() => {
      const urlInput = cy.findAllByRole("textbox").eq(0);

      cy.get("@targetDashboardId").then(targetDashboardId => {
        urlInput.type(
          `http://localhost:4000/dashboard/${targetDashboardId}?source={{source}}&category={{category}}&count={{count}}`,
          {
            parseSpecialCharSequences: false,
          },
        );
      });
      cy.button("Done").click();
    });

    cy.get("aside").button("Done").click();

    saveDashboard();

    // test top header row
    getDashboardCard().findByText("Doohickey").click();
    cy.get("@targetDashboardId").then(targetDashboardId => {
      cy.location().should(({ pathname, search }) => {
        expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
        expect(search).to.equal("?category=Doohickey&count=&source=");
      });
    });

    // test left header row
    getDashboardCard().findByText("Affiliate").click();
    cy.get("@targetDashboardId").then(targetDashboardId => {
      cy.location().should(({ pathname, search }) => {
        expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
        expect(search).to.equal("?category=&count=&source=Affiliate");
      });
    });
  });

  it("should allow click through on the pivot column of a regular table that has been pivoted (metabase#25203)", () => {
    const QUESTION_NAME = "Cypress Table Pivoted";
    const DASHBOARD_NAME = "Table Pivoted Dashboard";
    const testQuery = {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.SOURCE,
            { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
          ],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
      },
      database: SAMPLE_DB_ID,
    };

    cy.createQuestionAndDashboard({
      questionDetails: {
        name: QUESTION_NAME,
        query: testQuery.query,
        display: "table",
      },
      dashboardDetails: {
        name: DASHBOARD_NAME,
      },
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("targetDashboardId");
      visitDashboard(dashboard_id);
    });

    editDashboard();

    getDashboardCard().realHover().icon("click").click();
    cy.get("aside").findByText("User → Source").click();
    addUrlDestination();

    modal().within(() => {
      const urlInput = cy.findAllByRole("textbox").eq(0);

      cy.get("@targetDashboardId").then(targetDashboardId => {
        urlInput.type(
          `http://localhost:4000/dashboard/${targetDashboardId}?source={{source}}`,
          {
            parseSpecialCharSequences: false,
          },
        );
      });
      cy.button("Done").click();
    });

    cy.get("aside").button("Done").click();

    saveDashboard();

    // test pivoted column
    getDashboardCard().findByText("Organic").click();
    cy.get("@targetDashboardId").then(targetDashboardId => {
      cy.location().should(({ pathname, search }) => {
        expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
        expect(search).to.equal("?source=Organic");
      });
    });
  });

  it("should not pass through null values to filters in custom url click behavior (metabase#25203)", () => {
    const DASHBOARD_NAME = "Click Behavior Custom URL Dashboard";
    const questionDetails = {
      name: "Orders",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["sum", ["field", ORDERS.DISCOUNT, null]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        filter: ["=", ["field", ORDERS.USER_ID, null], 1],
      },
      display: "bar",
    };

    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: {
        name: DASHBOARD_NAME,
      },
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("targetDashboardId");
      visitDashboard(dashboard_id);
    });

    editDashboard();

    getDashboardCard().realHover().icon("click").click();
    addUrlDestination();

    modal().within(() => {
      const urlInput = cy.findAllByRole("textbox").eq(0);

      cy.get("@targetDashboardId").then(targetDashboardId => {
        urlInput.type(
          `http://localhost:4000/dashboard/${targetDashboardId}?discount={{sum_2}}&total={{sum}}`,
          {
            parseSpecialCharSequences: false,
          },
        );
      });
      cy.button("Done").click();
    });

    cy.get("aside").button("Done").click();

    saveDashboard();

    // test that normal values still work properly
    getDashboardCard().within(() => {
      chartPathWithFillColor("#88BF4D").eq(2).click();
    });
    cy.get("@targetDashboardId").then(targetDashboardId => {
      cy.location().should(({ pathname, search }) => {
        expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
        expect(search).to.equal(
          "?discount=15.070632139056723&total=298.9195210424866",
        );
      });
    });

    // test that null and "empty"s do not get passed through
    getDashboardCard().within(() => {
      chartPathWithFillColor("#88BF4D").eq(1).click();
    });
    cy.get("@targetDashboardId").then(targetDashboardId => {
      cy.location().should(({ pathname, search }) => {
        expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
        expect(search).to.equal("?discount=&total=420.3189231596888");
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
  cartesianChartCircle()
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

const addDashboardDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("Dashboard").click();
  entityPickerModal()
    .findByRole("tab", { name: /Dashboards/ })
    .click();
  entityPickerModal().findByText(TARGET_DASHBOARD.name).click();
};

const addUrlDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("URL").click();
};

const addSavedQuestionDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("Saved question").click();
  entityPickerModal()
    .findByRole("tab", { name: /Questions/ })
    .click();
  entityPickerModal().findByText(TARGET_QUESTION.name).click();
};

const addSavedQuestionCreatedAtParameter = () => {
  cy.get("aside")
    .findByTestId("click-mappings")
    .findByText("Created At")
    .click();
  popover().within(() => {
    cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist").click();
  });
};

const addSavedQuestionQuantityParameter = () => {
  cy.get("aside").findByTestId("click-mappings").findByText("Quantity").click();
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

const addNumericParameter = () => {
  cy.get("aside").findByText(DASHBOARD_FILTER_NUMBER.name).click();
  popover().within(() => {
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
    cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
  });
};

const createTextFilterMapping = ({ card_id }) => {
  const fieldRef = [
    "field",
    PEOPLE.NAME,
    {
      "base-type": "type/Text",
      "source-field": ORDERS.USER_ID,
    },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_TEXT.id,
    target: ["dimension", fieldRef],
  };
};

const createTimeFilterMapping = ({ card_id }) => {
  const fieldRef = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime" },
  ];

  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_TIME.id,
    target: ["dimension", fieldRef],
  };
};

const createNumberFilterMapping = ({ card_id }) => {
  const fieldRef = ["field", ORDERS.QUANTITY, { "base-type": "type/Number" }];

  return {
    card_id,
    parameter_id: DASHBOARD_FILTER_NUMBER.id,
    target: ["dimension", fieldRef],
  };
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

  saveDashboard({ waitMs: 250 });
  // this is necessary due to query params being reset after saving dashboard
  // with filter applied, which causes dashcard to be refetched
  cy.wait(1);

  clickLineChartPoint();
  assertDrillThroughMenuOpen();
};

const getTableCell = index => {
  return cy
    .findAllByTestId("table-row")
    .eq(POINT_INDEX)
    .findAllByTestId("cell-data")
    .eq(index);
};

const getCreatedAtToQuestionMapping = () => {
  return cy
    .get("aside")
    .contains(`${CREATED_AT_COLUMN_NAME} goes to "${TARGET_QUESTION.name}"`);
};

const getCountToDashboardMapping = () => {
  return cy
    .get("aside")
    .contains(`${COUNT_COLUMN_NAME} goes to "${TARGET_DASHBOARD.name}"`);
};

const getCreatedAtToUrlMapping = () => {
  return cy.get("aside").contains(`${CREATED_AT_COLUMN_NAME} goes to URL`);
};

const getCountToDashboardFilterMapping = () => {
  return cy.get("aside").contains(`${COUNT_COLUMN_NAME} updates 1 filter`);
};

const createDashboardWithTabsLocal = ({
  dashboard: dashboardDetails,
  tabs,
  dashcards = [],
  options,
}) => {
  cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    if (options?.wrapId) {
      cy.wrap(dashboard.id).as(options.idAlias ?? "dashboardId");
    }
    cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
      ...dashboard,
      dashcards,
      tabs,
    }).then(({ body: dashboard }) => {
      dashboard.tabs.forEach(tab => {
        cy.wrap(tab.id).as(`${tab.name}-id`);
      });
    });
  });
};
