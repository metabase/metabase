const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  NORMAL_USER_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockActionParameter,
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const COUNT_COLUMN_ID = "count";
const COUNT_COLUMN_NAME = "Count";
const COUNT_COLUMN_SOURCE = {
  type: "column",
  id: COUNT_COLUMN_ID,
  name: COUNT_COLUMN_NAME,
};
const CREATED_AT_COLUMN_ID = "CREATED_AT";
const CREATED_AT_COLUMN_NAME = "Created At: Month";
const CREATED_AT_COLUMN_SOURCE = {
  type: "column",
  id: CREATED_AT_COLUMN_ID,
  name: CREATED_AT_COLUMN_NAME,
};
const FILTER_VALUE = "Dell Adams";
const FILTERED_POINT_COUNT = 1;
const FILTERED_POINT_CREATED_AT = "2026-10";
const POINT_COUNT = 64;
const POINT_CREATED_AT = "2025-07";
const POINT_CREATED_AT_FORMATTED = "July 2025";
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

const {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

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

const DASHBOARD_FILTER_TEXT_WITH_DEFAULT = createMockActionParameter({
  id: "4",
  name: "Text filter with default",
  slug: "filter-with-default",
  type: "string/=",
  sectionId: "string",
  default: "Hello",
});

const URL_BASE = "https://metabase.com/";
const URL_WITH_PARAMS = `${URL_BASE}{{${DASHBOARD_FILTER_TEXT.slug}}}/{{${COUNT_COLUMN_ID}}}/{{${CREATED_AT_COLUMN_ID}}}`;
const URL_WITH_FILLED_PARAMS = URL_WITH_PARAMS.replace(
  `{{${COUNT_COLUMN_ID}}}`,
  FILTERED_POINT_COUNT,
)
  .replace(`{{${CREATED_AT_COLUMN_ID}}}`, FILTERED_POINT_CREATED_AT)
  .replace(
    `{{${DASHBOARD_FILTER_TEXT.slug}}}`,
    encodeURIComponent(FILTER_VALUE),
  );

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("/api/dataset").as("dataset");
    H.activateToken("pro-self-hosted");
  });

  describe("dashcards without click behavior", () => {
    it("does not allow to set click behavior for virtual and object detail dashcards", () => {
      const textCard = H.getTextCardDetails({ size_y: 1 });
      const headingCard = H.getHeadingCardDetails({ text: "Heading card" });
      const actionCard = H.getActionCardDetails();
      const linkCard = H.getLinkCardDetails();
      const cards = [textCard, headingCard, actionCard, linkCard];

      H.createQuestion(OBJECT_DETAIL_CHART).then(
        ({ body: { id: objectDetailCardId } }) => {
          H.createDashboard().then(({ body: dashboard }) => {
            H.updateDashboardCards({
              dashboard_id: dashboard.id,
              cards: [
                ...cards,
                { card_id: objectDetailCardId, row: 12, col: 0 },
              ],
            });
            H.visitDashboard(dashboard.id);
          });
        },
      );

      H.editDashboard();

      cards.forEach((card, index) => {
        const display = card.visualization_settings.virtual_card.display;
        cy.log(`does not allow to set click behavior for "${display}" card`);

        H.getDashboardCard(index).realHover();
        H.getDashboardCard(index)
          .findByLabelText("Duplicate")
          .should("be.visible");
        H.getDashboardCard(index).icon("click").should("not.exist");
      });

      cy.log('does not allow to set click behavior for "object" card');
      H.getDashboardCard(cards.length).realHover();
      H.getDashboardCard(cards.length)
        .findByLabelText("Duplicate")
        .should("be.visible");
      H.getDashboardCard(cards.length).icon("click").should("not.exist");
    });
  });

  describe("line chart", () => {
    const questionDetails = QUESTION_LINE_CHART;

    it("should open drill-through menu for native query based dashcard", () => {
      H.createNativeQuestionAndDashboard({
        questionDetails: {
          name: "Native Question",
          display: "line",
          native: {
            query: `
              SELECT
                DATE_TRUNC('month', CREATED_AT) AS "Created At",
                COUNT(*) AS "count"
              FROM
                ORDERS
              GROUP BY
                DATE_TRUNC('month', CREATED_AT)
              LIMIT
                5
            `,
          },
        },
        dashboardDetails: {
          name: "Dashboard",
        },
      }).then(({ body: card }) => {
        H.visitDashboard(card.dashboard_id);
      });

      clickLineChartPoint();
      H.popover()
        .should("contain", "Filter by this value")
        .and("not.contain", "See this");
    });

    it("allows setting dashboard without filters as custom destination and changing it back to default click behavior", () => {
      H.createDashboard(TARGET_DASHBOARD, {
        wrapId: true,
        idAlias: "targetDashboardId",
      });
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          cy.wrap(card.dashboard_id).as("sourceDashboardId");
          H.visitDashboard(card.dashboard_id);
        },
      );

      cy.log("drill-through menu is the default click behavior");
      clickLineChartPoint();
      assertDrillThroughMenuOpen();

      H.editDashboard();

      cy.log("doesn't throw when setting default behavior (metabase#35354)");
      const typeErrors = [];
      cy.on("uncaught:exception", (error) => {
        if (error.name.includes("TypeError")) {
          typeErrors.push(error);
        }
      });

      H.getDashboardCard().realHover().icon("click").click();

      // When the default menu is selected, it should've visual cue (metabase#34848)
      cy.get("aside")
        .findByText("Open the Metabase drill-through menu")
        .parent()
        .parent()
        .should("have.attr", "aria-selected", "true")
        .should("have.css", "background-color", "rgb(80, 158, 226)");

      addDashboardDestination();
      cy.get("aside").findByText("No available targets").should("exist");
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      cy.intercept(
        "GET",
        "/api/collection/root",
        cy.spy().as("rootCollection"),
      );
      cy.intercept("GET", "/api/collection", cy.spy().as("collections"));

      clickLineChartPoint();
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal("");
        });
      });

      cy.log("Should navigate to question using router (metabase#33379)");
      H.dashboardHeader()
        .findByText(TARGET_DASHBOARD.name)
        .should("be.visible");
      // If the page was reloaded, many API request would have been made and theses
      // calls are 2 of those.
      cy.get("@rootCollection").should("not.have.been.called");
      cy.get("@collections").should("not.have.been.called");

      cy.go("back");
      cy.get("@sourceDashboardId").then((sourceDashboardId) => {
        cy.location("pathname").should("eq", `/dashboard/${sourceDashboardId}`);
      });
      testChangingBackToDefaultBehavior();
      cy.then(() => {
        expect(typeErrors).to.have.length(0);
      });
    });

    it("allows setting dashboard with multiple parameters as custom destination, and handles the target filters being removed (metabase#35444)", () => {
      H.createDashboard(
        {
          ...TARGET_DASHBOARD,
          parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
        },
        {
          wrapId: true,
          idAlias: "targetDashboardId",
        },
      ).then((dashboardId) => {
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

      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          cy.wrap(card.dashboard_id).as("sourceDashboardId");
          H.visitDashboard(card.dashboard_id);
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      addTextParameter();
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTimeParameter();
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("parameter-widget")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
          );
        });
      });

      cy.go("back");
      assertOnSourceDashboard();

      cy.log("remove the filters from the target dashboard (metabase#35444)");
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.request("PUT", `/api/dashboard/${targetDashboardId}`, {
          parameters: [],
        });
      });

      cy.log(
        "reload source dashboard to apply removed filter of target dashboard in the mappings",
      );
      cy.reload();

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();

      cy.get("aside").should("contain", "No available targets");
      cy.get("aside").button("Done").click();

      H.saveDashboard({ awaitRequest: false });
      cy.wait("@saveDashboard-getDashboardMetadata");

      clickLineChartPoint();

      cy.findByTestId("dashboard-header").should(
        "contain",
        TARGET_DASHBOARD.name,
      );

      cy.log("search shouldn't contain `undefined=`");
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal("");
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

      tabs.forEach((tab) => {
        cy.get(`@${tab.name}-id`).then((tabId) => {
          TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
        });
      });

      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          H.visitDashboard(card.dashboard_id);
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      addDashboardDestination();
      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("have.value", FIRST_TAB.name)
        .click();
      cy.findByRole("listbox").findByText(SECOND_TAB.name).click();
      cy.get("aside").findByText("No available targets").should("not.exist");
      addTextParameter();
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("parameter-widget")
        .should("have.length", 1)
        .should("contain.text", POINT_COUNT);
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          const tabParam = `tab=${TAB_SLUG_MAP[SECOND_TAB.name]}`;
          const textFilterParam = `${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`;
          expect(search).to.equal(`?${textFilterParam}&${tabParam}`);
        });
      });
    });

    it("should fall back to the first tab after target dashboard tab has been removed and there is only 1 tab left", () => {
      H.createDashboard(TARGET_DASHBOARD, {
        wrapId: true,
        idAlias: "targetDashboardId",
      });
      cy.get("@targetDashboardId").then((targetDashboardId) => {
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
        H.createQuestionAndDashboard({
          questionDetails,
          cardDetails,
        }).then(({ body: card }) => {
          H.visitDashboard(card.dashboard_id);
        });
      });

      H.editDashboard();
      H.getDashboardCard().realHover().icon("click").click();

      // Wait for the click behavior sidebar to finish loading the target
      // dashboard before saving. The `migrateDeletedTab` effect that falls the
      // now-invalid tabId back to the first tab — which is what dirties the
      // dashboard and triggers the save request — only runs once the target
      // dashboard has loaded. Asserting the tab selector is absent passes
      // trivially before that load, so we anchor on a positive signal first.
      cy.get("aside")
        .findByText("Pass values to this dashboard's filters (optional)")
        .should("be.visible");
      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("not.exist");
      cy.get("aside").button("Done").should("be.enabled").click();
      H.saveDashboard();

      clickLineChartPoint();
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal("");
        });
      });
    });

    it("dashboard click behavior works without tabId previously saved, and shows an error after target dashboard tab has been removed and there is more than 1 tab left", () => {
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
      tabs.forEach((tab) => {
        cy.get(`@${tab.name}-id`).then((tabId) => {
          TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
        });
      });

      cy.get("@targetDashboardId").then((targetDashboardId) => {
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
        H.createQuestionAndDashboard({
          questionDetails,
          cardDetails,
        }).then(({ body: card }) => {
          H.visitDashboard(card.dashboard_id);
          cy.wrap(card).as("sourceDashcard");
        });
      });

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("have.value", FIRST_TAB.name);

      cy.get("header").button("Cancel").click();
      // migrateUndefinedDashboardTabId causes detection of changes even though user did not change anything
      H.modal().button("Discard changes").click();
      cy.button("Cancel").should("not.exist");
      cy.findByTestId("visualization-root")
        .findByText("May 2025")
        .should("exist");
      clickLineChartPoint();
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(`?tab=${TAB_SLUG_MAP[FIRST_TAB.name]}`);
        });
      });

      cy.log("target dashboard tab has been removed, more than 1 tab left");
      cy.get("@sourceDashcard").then((dashcard) => {
        cy.get("@targetDashboardId").then((targetDashboardId) => {
          const inexistingTabId = 999;
          H.addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              id: dashcard.id,
              visualization_settings: {
                click_behavior: {
                  parameterMapping: {},
                  targetId: targetDashboardId,
                  tabId: inexistingTabId,
                  linkType: "dashboard",
                  type: "link",
                },
              },
            },
          });
          H.visitDashboard(dashcard.dashboard_id);
        });
      });

      H.editDashboard();
      H.getDashboardCard().realHover().icon("click").click();

      cy.get("aside")
        .findByText("The selected tab is no longer available")
        .should("exist");
      cy.button("Done").should("be.disabled");

      cy.get("aside")
        .findByLabelText("Select a dashboard tab")
        .should("have.value", "")
        .click();
      cy.findByRole("listbox").findByText(SECOND_TAB.name).click();

      cy.get("aside")
        .findByText("The selected tab is no longer available")
        .should("not.exist");
      cy.button("Done").should("be.enabled").click();

      H.saveDashboard();

      clickLineChartPoint();
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(`?tab=${TAB_SLUG_MAP[SECOND_TAB.name]}`);
        });
      });
    });

    it("sets non-specified parameters to default values and parameters with default values to the mapped value when accessed from a click action", () => {
      H.createDashboard(
        {
          ...TARGET_DASHBOARD,
          parameters: [
            DASHBOARD_FILTER_TEXT,
            DASHBOARD_FILTER_TEXT_WITH_DEFAULT,
          ],
        },
        {
          wrapId: true,
          idAlias: "targetDashboardId",
        },
      )
        .then((dashboardId) => {
          return cy
            .request("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: [
                createMockDashboardCard({
                  card_id: ORDERS_QUESTION_ID,
                  parameter_mappings: [
                    createTextFilterMapping({ card_id: ORDERS_QUESTION_ID }),
                    createTextFilterWithDefaultMapping({
                      card_id: ORDERS_QUESTION_ID,
                    }),
                  ],
                }),
              ],
            })
            .then(() => dashboardId);
        })
        .then((dashboardId) => {
          H.visitDashboard(dashboardId);
        });

      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
        "targetDashcardQuery",
      );

      cy.findAllByTestId("parameter-widget")
        .contains(DASHBOARD_FILTER_TEXT.name)
        .parent()
        .click();
      H.dashboardParametersPopover().within(() => {
        H.fieldValuesCombobox().type("John Doe{enter}{esc}");
        cy.button("Add filter").click();
      });
      cy.wait("@targetDashcardQuery");

      cy.findAllByTestId("parameter-widget")
        .contains(DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name)
        .parent()
        .click();
      H.dashboardParametersPopover().within(() => {
        H.fieldValuesCombobox().type("{backspace}World{enter}{esc}");
        cy.button("Update filter").click();
      });
      cy.wait("@targetDashcardQuery");

      H.createDashboardWithQuestions({
        questions: [questionDetails, questionDetails],
        cards: [
          { row: 0, col: 0 },
          { row: 0, col: 12 },
        ],
      }).then(({ dashboard }) => {
        cy.wrap(dashboard.id).as("sourceDashboardId");
        H.visitDashboard(dashboard.id);
      });

      H.editDashboard();

      H.getDashboardCard(0).realHover().icon("click").click();
      addDashboardDestination();
      addTextParameter();
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").findByText("No available targets").should("not.exist");
      cy.get("aside").button("Done").click();

      H.getDashboardCard(1).realHover().icon("click").click();
      addDashboardDestination();
      addTextWithDefaultParameter();
      cy.get("aside").findByText("Select a dashboard tab").should("not.exist");
      cy.get("aside").findByText("No available targets").should("not.exist");
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      cy.log("parameters with default values get the mapped value");
      clickLineChartPoint({ dashcardIndex: 1 });
      cy.findAllByTestId("parameter-widget")
        .contains(DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name)
        .parent()
        .should("contain.text", POINT_COUNT);

      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=&${DASHBOARD_FILTER_TEXT_WITH_DEFAULT.slug}=${POINT_COUNT}`,
          );
        });
      });

      cy.go("back");
      cy.get("@sourceDashboardId").then((sourceDashboardId) => {
        cy.location("pathname").should("eq", `/dashboard/${sourceDashboardId}`);
      });

      cy.log("non-specified parameters get their default values");
      clickLineChartPoint({ dashcardIndex: 0 });

      cy.findAllByTestId("parameter-widget")
        .contains(DASHBOARD_FILTER_TEXT.name)
        .parent()
        .should("contain.text", POINT_COUNT);
      cy.findAllByTestId("parameter-widget")
        .contains(DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name)
        .parent()
        .should("contain.text", DASHBOARD_FILTER_TEXT_WITH_DEFAULT.default);

      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TEXT_WITH_DEFAULT.slug}=Hello`,
          );
        });
      });
    });

    it("does not allow setting dashboard or saved question as custom destination if user has no permissions to it", () => {
      H.createCollection({ name: RESTRICTED_COLLECTION_NAME }).then(
        ({ body: restrictedCollection }) => {
          cy.updateCollectionGraph({
            [USER_GROUPS.COLLECTION_GROUP]: {
              [restrictedCollection.id]: "none",
            },
          });

          H.createDashboard({
            ...TARGET_DASHBOARD,
            collection_id: restrictedCollection.id,
          });
          H.createQuestion({
            ...TARGET_QUESTION,
            collection_id: restrictedCollection.id,
          });
        },
      );

      cy.signOut();
      cy.signInAsNormalUser();

      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          H.visitDashboard(card.dashboard_id);
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Go to a custom destination").click();
      cy.get("aside").findByText("Dashboard").click();

      H.modal().findByText("Orders in a dashboard").should("be.visible");
      H.modal().findByText(RESTRICTED_COLLECTION_NAME).should("not.exist");

      cy.log("reset the link type and pick a saved question");
      cy.realPress("Escape");
      cy.get("aside")
        .findByText("Pick a dashboard…")
        .closest("button")
        .parent()
        .icon("close")
        .click();
      cy.get("aside").findByText("Saved question").click();

      H.modal().findByText("Orders").should("be.visible");
      H.modal().findByText(RESTRICTED_COLLECTION_NAME).should("not.exist");
    });

    it("allows setting saved question with no, one and multiple parameters as custom destination and changing it back to default click behavior, but not updating dashboard filters if there are none", () => {
      H.createQuestion(TARGET_QUESTION, { wrapId: true });
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          cy.wrap(card.dashboard_id).as("sourceDashboardId");
          H.visitDashboard(card.dashboard_id);
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      cy.log("does not allow updating dashboard filters if there are none");
      cy.get("aside")
        .findByText("Update a dashboard filter")
        .invoke("css", "pointer-events")
        .should("equal", "none");
      addSavedQuestionDestination();
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      cy.intercept(
        "GET",
        "/api/collection/root",
        cy.spy().as("rootCollection"),
      );
      cy.intercept("GET", "/api/collection", cy.spy().as("collections"));

      clickLineChartPoint();
      cy.get("@questionId").then((questionId) => {
        cy.location()
          .its("pathname")
          .should("contain", `/question/${questionId}`);
      });
      H.queryBuilderHeader()
        .findByDisplayValue(TARGET_QUESTION.name)
        .should("be.visible");

      cy.log("Should navigate to question using router (metabase#33379)");
      cy.findByTestId("view-footer").should("contain", "Showing 5 rows");
      // If the page was reloaded, many API request would have been made and theses
      // calls are 2 of those.
      cy.get("@rootCollection").should("not.have.been.called");
      cy.get("@collections").should("not.have.been.called");

      cy.go("back");
      assertOnSourceDashboard();

      cy.log("saved question with a single parameter");
      H.editDashboard();
      H.getDashboardCard().realHover().icon("click").click();
      addSavedQuestionCreatedAtParameter();
      cy.get("aside").button("Done").click();
      H.saveDashboard();

      clickLineChartPoint();
      cy.findByTestId("qb-filters-panel").should(
        "have.text",
        "Created At is Jul 1–31, 2025",
      );
      cy.location("pathname").should("equal", "/question");
      cy.findByTestId("app-bar").should(
        "contain.text",
        `Started from ${TARGET_QUESTION.name}`,
      );
      verifyVizTypeIsLine();

      H.openNotebook();
      H.verifyNotebookQuery("Orders", [
        {
          filters: ["Created At is Jul 1–31, 2025"],
          aggregations: ["Count"],
          breakouts: ["Created At: Month"],
          limit: 5,
        },
      ]);

      cy.go("back");
      cy.log("return to the dashboard");
      cy.go("back");
      assertOnSourceDashboard();

      cy.log("saved question with multiple parameters");
      H.editDashboard();
      H.getDashboardCard().realHover().icon("click").click();
      addSavedQuestionQuantityParameter();
      cy.get("aside").button("Done").click();
      H.saveDashboard();

      clickLineChartPoint();
      cy.wait("@dataset");
      cy.findByTestId("qb-filters-panel")
        .should("contain.text", "Created At is Jul 1–31, 2025")
        .should("contain.text", "Quantity is equal to 64");

      cy.location("pathname").should("equal", "/question");
      cy.findByTestId("app-bar").should(
        "contain.text",
        `Started from ${TARGET_QUESTION.name}`,
      );
      verifyVizTypeIsLine();

      H.openNotebook();
      H.verifyNotebookQuery("Orders", [
        {
          filters: ["Created At is Jul 1–31, 2025", "Quantity is equal to 64"],
          aggregations: ["Count"],
          breakouts: ["Created At: Month"],
          limit: 5,
        },
      ]);

      cy.go("back");
      cy.log("return to the dashboard");
      cy.go("back");
      assertOnSourceDashboard();
      testChangingBackToDefaultBehavior();
    });

    it("allows setting URL with and without parameters as custom destination and changing it back to default click behavior", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT],
      };

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          H.updateDashboardCards({
            dashboard_id: dashcard.dashboard_id,
            cards: [
              {
                card_id: dashcard.card_id,
                parameter_mappings: [
                  createTextFilterMapping({ card_id: dashcard.card_id }),
                ],
              },
              { card_id: dashcard.card_id, col: 12 },
            ],
          });
          H.visitDashboard(dashcard.dashboard_id);
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      addUrlDestination();
      H.modal().findByText("Values you can reference").click();
      H.popover().within(() => {
        cy.findByText(COUNT_COLUMN_ID).should("exist");
        cy.findByText(CREATED_AT_COLUMN_ID).should("exist");
        cy.findByText(DASHBOARD_FILTER_TEXT.name).should("exist");
      });
      H.modal().findByText("Values you can reference").click();
      H.modal().within(() => {
        cy.findByRole("textbox").type(URL_WITH_PARAMS, {
          parseSpecialCharSequences: false,
        });
        cy.button("Done").click();
      });
      cy.get("aside").button("Done").click();

      H.getDashboardCard(1).realHover().icon("click").click();
      addUrlDestination();
      H.modal().within(() => {
        cy.findByRole("textbox").type(URL_BASE);
        cy.button("Done").click();
      });
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      cy.log("URL without parameters");
      H.stubAnchorClick();
      clickLineChartPoint({ dashcardIndex: 1 });
      H.assertAnchorClicked({ href: URL_BASE });
      cy.get("@anchorClick").invoke("resetHistory");

      cy.log("URL with parameters");
      cy.button(DASHBOARD_FILTER_TEXT.name).click();
      H.dashboardParametersPopover().within(() => {
        cy.findByPlaceholderText("Search the list").type(FILTER_VALUE);
        cy.button("Add filter").click();
      });

      clickLineChartPoint({ dashcardIndex: 0 });
      H.assertAnchorClicked({ href: URL_WITH_FILLED_PARAMS });

      H.clearFilterWidget();
      testChangingBackToDefaultBehavior();
    });

    it("allows updating single dashboard filter and changing it back to default click behavior", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_NUMBER],
      };

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createNumberFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          H.visitDashboard(dashcard.dashboard_id);
          cy.location().then(({ pathname }) => {
            cy.wrap(pathname).as("originalPathname");
          });
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Update a dashboard filter").click();
      addNumericParameter();
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("parameter-widget")
        .should("have.length", 1)
        .should("contain.text", POINT_COUNT);
      cy.get("@originalPathname").then((originalPathname) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(originalPathname);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_NUMBER.slug}=${POINT_COUNT}`,
          );
        });
      });

      cy.log("reset filter state");

      H.filterWidget().icon("close").click();

      testChangingBackToDefaultBehavior();
    });

    it("allows updating multiple dashboard filters and updates behavior after a linked dashboard filter has been removed", () => {
      const dashboardDetails = {
        parameters: [DASHBOARD_FILTER_TEXT, DASHBOARD_FILTER_TIME],
      };

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createTextFilterMapping({ card_id: dashcard.card_id }),
                createTimeFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          H.visitDashboard(dashcard.dashboard_id);
          cy.location().then(({ pathname }) => {
            cy.wrap(pathname).as("originalPathname");
          });
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      cy.get("aside").findByText("Update a dashboard filter").click();
      addTextParameter();
      addTimeParameter();
      cy.get("aside")
        .should("contain.text", DASHBOARD_FILTER_TEXT.name)
        .should("contain.text", COUNT_COLUMN_NAME);
      cy.get("aside").button("Done").click();

      H.saveDashboard();

      clickLineChartPoint();
      cy.findAllByTestId("parameter-widget")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
      cy.get("@originalPathname").then((originalPathname) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(originalPathname);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
          );
        });
      });

      H.clearFilterWidget(0);
      H.clearFilterWidget(1);
      cy.location("search").should("eq", "");

      H.editDashboard();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText(DASHBOARD_FILTER_TEXT.name)
        .click();
      cy.get("aside").button("Remove").click();

      H.saveDashboard();
      cy.location("search").should("eq", "");

      clickLineChartPoint();
      cy.findAllByTestId("parameter-widget")
        .should("have.length", 1)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
      cy.get("@originalPathname").then((originalPathname) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(originalPathname);
          expect(search).to.equal(
            `?${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
          );
        });
      });

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      cy.get("aside")
        .should("contain.text", DASHBOARD_FILTER_TIME.name)
        .should("not.contain.text", DASHBOARD_FILTER_TEXT.name)
        .should("not.contain.text", COUNT_COLUMN_NAME);
    });
  });

  describe("table", () => {
    const questionDetails = QUESTION_TABLE;
    const dashboardDetails = {
      parameters: [DASHBOARD_FILTER_TEXT],
    };

    it("should open drill-through menu by default and allow setting dashboard and saved question as custom destination for different columns", () => {
      H.createQuestion(TARGET_QUESTION);
      H.createDashboard(
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
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          H.visitDashboard(card.dashboard_id);
        },
      );

      cy.log("drill-through menu is the default click behavior");
      getTableCell(COLUMN_INDEX.COUNT).click();
      H.popover().should("contain.text", "Filter by this value");

      getTableCell(COLUMN_INDEX.CREATED_AT).click();
      H.popover().should("contain.text", "Filter by this date and time");

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
      H.getDashboardCard()
        .button()
        .should("have.text", "Open the drill-through menu");

      (function addCustomDashboardDestination() {
        cy.log("custom destination (dashboard) behavior for 'Count' column");

        cy.get("aside").findByText(COUNT_COLUMN_NAME).should("be.visible");
        getCountToDashboardMapping().should("not.exist");
        cy.get("aside").findByText(COUNT_COLUMN_NAME).click();
        addDashboardDestination();
        addTextParameter();
        cy.get("aside")
          .findByText("Select a dashboard tab")
          .should("not.exist");
        cy.get("aside").findByText("No available targets").should("not.exist");
        addTimeParameter();
        customizeLinkText(`Count: {{${COUNT_COLUMN_ID}}}`);

        cy.icon("chevronleft").click();

        getCountToDashboardMapping().should("exist");
        H.getDashboardCard()
          .button()
          .should("have.text", "1 column has custom behavior");
      })();

      (function addCustomQuestionDestination() {
        cy.log(
          "custom destination (question) behavior for 'Created at' column",
        );

        cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).should("be.visible");
        getCreatedAtToQuestionMapping().should("not.exist");
        cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).click();
        addSavedQuestionDestination();
        addSavedQuestionCreatedAtParameter();
        addSavedQuestionQuantityParameter();
        customizeLinkText(`Created at: {{${CREATED_AT_COLUMN_ID}}}`);

        cy.icon("chevronleft").click();

        getCreatedAtToQuestionMapping().should("exist");
        H.getDashboardCard()
          .button()
          .should("have.text", "2 columns have custom behavior");
      })();

      cy.get("aside").button("Done").click();
      H.saveDashboard();

      (function testDashboardDestinationClick() {
        cy.log("it handles 'Count' column click");

        getTableCell(COLUMN_INDEX.COUNT)
          .should("have.text", `Count: ${POINT_COUNT}`)
          .click();

        cy.get("@targetDashboardId").then((targetDashboardId) => {
          cy.location().should(({ pathname, search }) => {
            expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
            expect(search).to.equal(
              `?${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}&${DASHBOARD_FILTER_TIME.slug}=${POINT_CREATED_AT}`,
            );
          });
        });

        cy.findAllByTestId("parameter-widget")
          .should("have.length", 2)
          .should("contain.text", POINT_COUNT)
          .should("contain.text", POINT_CREATED_AT_FORMATTED);
      })();

      cy.go("back");

      (function testQuestionDestinationClick() {
        cy.log("it handles 'Created at' column click");

        getTableCell(COLUMN_INDEX.CREATED_AT)
          .should("have.text", `Created at: ${POINT_CREATED_AT_FORMATTED}`)
          .click();
        cy.wait("@dataset");
        cy.findByTestId("qb-filters-panel")
          .should("contain.text", "Created At is Jul 1–31, 2025")
          .should("contain.text", "Quantity is equal to 64");

        cy.location("pathname").should("equal", "/question");
        cy.findByTestId("app-bar").should(
          "contain.text",
          `Started from ${TARGET_QUESTION.name}`,
        );
        verifyVizTypeIsLine();

        H.openNotebook();
        H.verifyNotebookQuery("Orders", [
          {
            filters: [
              "Created At is Jul 1–31, 2025",
              "Quantity is equal to 64",
            ],
            aggregations: ["Count"],
            breakouts: ["Created At: Month"],
            limit: 5,
          },
        ]);
      })();
    });

    it("should allow setting dashboard tab with parameter for a column", () => {
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
      tabs.forEach((tab) => {
        cy.get(`@${tab.name}-id`).then((tabId) => {
          TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
        });
      });

      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          H.visitDashboard(card.dashboard_id);
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover().icon("click").click();
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
      H.getDashboardCard()
        .button()
        .should("have.text", "1 column has custom behavior");

      cy.get("aside").button("Done").click();
      H.saveDashboard();

      getTableCell(COLUMN_INDEX.COUNT)
        .should("have.text", String(POINT_COUNT))
        .click();
      cy.findAllByTestId("parameter-widget")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT);

      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          const tabParam = `tab=${TAB_SLUG_MAP[SECOND_TAB.name]}`;
          const textFilterParam = `${DASHBOARD_FILTER_TEXT.slug}=${POINT_COUNT}`;
          const timeFilterParam = `${DASHBOARD_FILTER_TIME.slug}=`;
          expect(search).to.equal(
            `?${textFilterParam}&${timeFilterParam}&${tabParam}`,
          );
        });
      });
    });

    it("should allow setting URL as custom destination and updating dashboard filters for different columns", () => {
      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
        ({ body: dashcard }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id: dashcard.dashboard_id,
            card_id: dashcard.card_id,
            card: {
              parameter_mappings: [
                createTextFilterMapping({ card_id: dashcard.card_id }),
              ],
            },
          });
          H.visitDashboard(dashcard.dashboard_id);
          cy.location().then(({ pathname }) => {
            cy.wrap(pathname).as("originalPathname");
          });
        },
      );

      H.editDashboard();

      H.getDashboardCard().realHover();
      cy.icon("click").click();

      (function addUpdateDashboardFilters() {
        cy.log("update dashboard filters behavior for 'Count' column");

        cy.get("aside").findByText(COUNT_COLUMN_NAME).should("be.visible");
        getCountToDashboardFilterMapping().should("not.exist");
        cy.get("aside").findByText(COUNT_COLUMN_NAME).click();
        cy.get("aside").findByText("Update a dashboard filter").click();
        addTextParameter();
        cy.get("aside").findByRole("textbox").should("not.exist");

        cy.icon("chevronleft").click();

        getCountToDashboardFilterMapping().should("exist");
      })();

      H.getDashboardCard()
        .button()
        .should("have.text", "1 column has custom behavior");

      (function addCustomUrlDestination() {
        cy.log(
          "custom destination (URL) behavior for 'Created At' column",
        );

        cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).should("be.visible");
        getCreatedAtToUrlMapping().should("not.exist");
        cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).click();
        addUrlDestination();
        H.modal().within(() => {
          cy.findAllByRole("textbox")
            .eq(0)
            .as("urlInput")
            .type(URL_WITH_PARAMS, {
              parseSpecialCharSequences: false,
            });
          cy.findAllByRole("textbox")
            .eq(1)
            .as("customLinkTextInput")
            .type(`Created at: {{${CREATED_AT_COLUMN_ID}}}`, {
              parseSpecialCharSequences: false,
            })
            .blur();

          cy.button("Done").click();
        });

        cy.icon("chevronleft").click();

        getCreatedAtToUrlMapping().should("exist");
      })();

      H.getDashboardCard()
        .button()
        .should("have.text", "2 columns have custom behavior");

      cy.get("aside").button("Done").click();
      H.saveDashboard();

      (function testUpdateDashboardFiltersClick() {
        cy.log("it handles 'Count' column click");

        getTableCell(COLUMN_INDEX.COUNT).click();
        cy.findAllByTestId("parameter-widget")
          .should("have.length", 1)
          .should("contain.text", POINT_COUNT);
        cy.get("@originalPathname").then((originalPathname) => {
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
        H.dashboardParametersPopover().within(() => {
          H.removeFieldValuesValue(0);
          cy.findByPlaceholderText("Search the list").type(FILTER_VALUE);
          cy.button("Update filter").click();
        });
        H.stubAnchorClick();
        getTableCell(COLUMN_INDEX.CREATED_AT)
          .should("have.text", "Created at: October 2026")
          .click();
        H.assertAnchorClicked({ href: URL_WITH_FILLED_PARAMS });
      })();
    });
  });

  describe("static embedding", () => {
    const questionDetails = QUESTION_LINE_CHART;

    beforeEach(() => {
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
    });

    it("does not allow opening custom dashboard and question destinations", () => {
      const dashboardDetails = {
        name: "Embedded dashboard",
        enable_embedding: true,
        embedding_params: {},
      };

      H.createDashboard(
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
      H.createQuestion(
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

      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.get("@targetQuestionId").then((targetQuestionId) => {
          H.createDashboardWithQuestions({
            dashboardDetails,
            questions: [questionDetails, questionDetails],
            cards: [
              {
                row: 0,
                col: 0,
                visualization_settings: {
                  click_behavior: {
                    parameterMapping: {},
                    targetId: targetDashboardId,
                    linkType: "dashboard",
                    type: "link",
                  },
                },
              },
              {
                row: 0,
                col: 12,
                visualization_settings: {
                  click_behavior: {
                    parameterMapping: {},
                    targetId: targetQuestionId,
                    linkType: "question",
                    type: "link",
                  },
                },
              },
            ],
          }).then(({ dashboard }) => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboard.id },
              params: {},
            });
            cy.wait("@dashboard");
            cy.wait(["@cardQuery", "@cardQuery"]);
          });
        });
      });

      cy.log("dashboard destination");
      cy.url().then((originalUrl) => {
        clickLineChartPoint({ dashcardIndex: 0 });
        cy.url().should("eq", originalUrl);
      });
      cy.get("header").findByText(dashboardDetails.name).should("be.visible");
      cy.get("header").findByText(TARGET_DASHBOARD.name).should("not.exist");

      cy.log("question destination");
      cy.url().then((originalUrl) => {
        clickLineChartPoint({ dashcardIndex: 1 });
        cy.url().should("eq", originalUrl);
      });
      cy.get("header").findByText(dashboardDetails.name).should("be.visible");
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

      H.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: dashCard }) => {
        H.addOrUpdateDashboardCard({
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

        H.visitEmbeddedPage({
          resource: { dashboard: dashCard.dashboard_id },
          params: {},
        });
        cy.wait("@dashboard");
        cy.wait("@cardQuery");
      });

      cy.button(DASHBOARD_FILTER_TEXT.name).click();
      H.dashboardParametersPopover().within(() => {
        cy.findByPlaceholderText("Search the list").type(FILTER_VALUE);
        cy.button("Add filter").click();
      });
      H.stubAnchorClick();
      clickLineChartPoint();
      H.assertAnchorClicked({ href: URL_WITH_FILLED_PARAMS });
    });

    it("allows opening custom URL destination that is not a Metabase instance URL using link (metabase#33379)", () => {
      H.updateSetting("site-url", "https://localhost:4000/subpath");
      const dashboardDetails = {
        enable_embedding: true,
      };

      const metabaseInstanceUrl = "http://localhost:4000";
      H.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        H.addOrUpdateDashboardCard({
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

        H.visitEmbeddedPage({
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

      H.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: dashCard }) => {
        H.addOrUpdateDashboardCard({
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

        H.visitEmbeddedPage({
          resource: { dashboard: dashCard.dashboard_id },
          params: {},
        });
        cy.wait("@dashboard");
        cy.wait("@cardQuery");
      });

      clickLineChartPoint();
      cy.findAllByTestId("parameter-widget")
        .should("have.length", 2)
        .should("contain.text", POINT_COUNT)
        .should("contain.text", POINT_CREATED_AT_FORMATTED);
    });

    it("should navigate to public link URL (metabase#38640)", () => {
      H.createDashboard(TARGET_DASHBOARD)
        .then(({ body: { id: dashboardId } }) => {
          cy.log("create a public link for this dashboard");
          cy.request("POST", `/api/dashboard/${dashboardId}/public_link`).then(
            ({ body: { uuid } }) => {
              cy.wrap(uuid);
            },
          );
        })
        .then((uuid) => {
          H.createQuestionAndDashboard({
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
          H.visitDashboard(dashCard.dashboard_id);

          H.openLegacyStaticEmbeddingModal({
            resource: "dashboard",
            resourceId: dashCard.dashboard_id,
            activeTab: "parameters",
            unpublishBeforeOpen: false,
          });
        });

      H.visitIframe();
      clickLineChartPoint();

      cy.findByRole("heading", { name: TARGET_DASHBOARD.name }).should(
        "be.visible",
      );
    });
  });

  describe("multi-stage questions as target destination", () => {
    const questionDetails = {
      name: "Table",
      query: {
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
          ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
          [
            "field",
            PEOPLE.LONGITUDE,
            {
              "base-type": "type/Float",
              binning: {
                strategy: "default",
              },
              "source-field": ORDERS.USER_ID,
            },
          ],
        ],
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const targetQuestion = {
      name: "Target question",
      query: createMultiStageQuery(),
    };

    it("should allow navigating to questions with filters applied in every stage", () => {
      H.createQuestion(targetQuestion);
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: card }) => {
          H.visitDashboard(card.dashboard_id);
        },
      );

      H.editDashboard();
      H.getDashboardCard().realHover().icon("click").click();

      cy.get("aside").findByText(CREATED_AT_COLUMN_NAME).click();
      addSavedQuestionDestination();

      verifyAvailableClickTargetColumns([
        // 1st stage - Orders
        "ID",
        "User ID",
        "Product ID",
        "Subtotal",
        "Tax",
        "Total",
        "Discount",
        "Created At",
        "Quantity",
        // 1st stage - Custom columns
        "Net",
        // 1st stage - Reviews #1 (explicit join)
        "Reviews - Product → ID",
        "Reviews - Product → Product ID",
        "Reviews - Product → Reviewer",
        "Reviews - Product → Rating",
        "Reviews - Product → Body",
        "Reviews - Product → Created At",
        // 1st stage - Products (implicit join with Orders)
        "Product → ID",
        "Product → Ean",
        "Product → Title",
        "Product → Category",
        "Product → Vendor",
        "Product → Price",
        "Product → Rating",
        "Product → Created At",
        // 1st stage - People (implicit join with Orders)
        "User → ID",
        "User → Address",
        "User → Email",
        "User → Password",
        "User → Name",
        "User → City",
        "User → Longitude",
        "User → State",
        "User → Source",
        "User → Birth Date",
        "User → Zip",
        "User → Latitude",
        "User → Created At",
        // 1st stage - Products (implicit join with Reviews)
        "Product → ID",
        "Product → Ean",
        "Product → Title",
        "Product → Category",
        "Product → Vendor",
        "Product → Price",
        "Product → Rating",
        "Product → Created At",
        // 1st stage - Aggregations & breakouts
        "Created At: Month",
        "Product → Category",
        "User → Created At: Year",
        "Count",
        "Sum of Total",
        // 2nd stage - Custom columns
        "5 * Count",
        // 2nd stage - Reviews #2 (explicit join)
        "Reviews - Created At: Month → ID",
        "Reviews - Created At: Month → Product ID",
        "Reviews - Created At: Month → Reviewer",
        "Reviews - Created At: Month → Rating",
        "Reviews - Created At: Month → Body",
        "Reviews - Created At: Month → Created At",
        // 2nd stage - Aggregations & breakouts
        "Product → Category",
        "Reviews - Created At: Month → Created At",
        "Count",
        "Sum of Reviews - Created At: Month → Rating",
      ]);

      // 1st stage - Orders
      getClickMapping("ID").click();
      selectClickMappingSource("ID");

      // 1st stage - Custom columns
      getClickMapping("Net").click();
      selectClickMappingSource("User → Longitude: 10°");

      // 1st stage - Reviews #1 (explicit join)
      getClickMapping("Reviews - Product → Reviewer").click();
      selectClickMappingSource("Product → Category");

      // 1st stage - Products (implicit join with Orders)
      getClickMapping("Product → Title").first().click();
      selectClickMappingSource("Product → Category");

      // 1st stage - People (implicit join with Orders)
      getClickMapping("User → Longitude").click();
      selectClickMappingSource("User → Longitude: 10°");

      // 1st stage - Products (implicit join with Reviews)
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getClickMapping("Product → Vendor").last().click();
      selectClickMappingSource("Product → Category");

      // 1st stage - Aggregations & breakouts
      getClickMapping("Product → Category").eq(2).click();
      selectClickMappingSource("Product → Category");

      // 2nd stage - Custom columns
      getClickMapping("5 * Count").click();
      selectClickMappingSource("Count");

      // 2nd stage - Reviews #2 (explicit join)
      getClickMapping("Reviews - Created At: Month → Rating").click();
      selectClickMappingSource("ID");

      // 2nd stage - Aggregations & breakouts
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      getClickMapping("Count").last().click();
      selectClickMappingSource("User → Longitude: 10°");

      customizeLinkText(`Created at: {{${CREATED_AT_COLUMN_ID}}} - {{count}}`);

      cy.get("aside").button("Done").click();
      H.saveDashboard();

      H.getDashboardCard()
        .findAllByText("Created at: May 2025 - 1")
        .first()
        .click();

      cy.wait("@dataset");

      cy.location("pathname").should("equal", "/question");
      cy.findByTestId("app-bar").should(
        "contain.text",
        `Started from ${targetQuestion.name}`,
      );

      H.queryBuilderMain().findByText("No results").should("be.visible");
      H.queryBuilderMain()
        .findByText("There was a problem with your question")
        .should("not.exist");

      H.openNotebook();
      H.verifyNotebookQuery("Orders", [
        {
          joins: [
            {
              lhsTable: "Orders",
              rhsTable: "Reviews",
              type: "left-join",
              conditions: [
                {
                  operator: "=",
                  lhsColumn: "Product ID",
                  rhsColumn: "Product ID",
                },
              ],
            },
          ],
          expressions: ["Net"],
          filters: [
            "Product → Title is Doohickey",
            "Reviews - Product → Reviewer is Doohickey",
            "Product → Vendor is Doohickey",
            "ID is 7021",
            "User → Longitude is equal to -80",
            "Net is equal to -80",
          ],
          aggregations: ["Count", "Sum of Total"],
          breakouts: [
            "Created At: Month",
            "Product → Category",
            "User → Created At: Year",
          ],
        },
        {
          joins: [
            {
              lhsTable: "Orders",
              rhsTable: "Reviews",
              type: "left-join",
              conditions: [
                {
                  operator: "=",
                  lhsColumn: "Created At: Month",
                  rhsColumn: "Created At: Month",
                },
              ],
            },
          ],
          expressions: ["5 * Count"],
          filters: [
            "5 * Count is equal to 1",
            "Reviews - Created At: Month → Rating is equal to 7021",
            "Product → Category is Doohickey",
          ],
          aggregations: [
            "Count",
            "Sum of Reviews - Created At: Month → Rating",
          ],
          breakouts: [
            "Product → Category",
            "Reviews - Created At: Month → Created At",
          ],
        },
        {
          filters: ["Count is equal to -80"],
        },
      ]);
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

    H.createDashboardWithTabs({
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
    }).then((dashboard) => {
      cy.wrap(dashboard.id).as("targetDashboardId");
      dashboard.tabs.forEach((tab) => {
        cy.wrap(tab.id).as(`${tab.name}-id`);
      });
      H.visitDashboard(dashboard.id);
    });

    const TAB_SLUG_MAP = {};
    tabs.forEach((tab) => {
      cy.get(`@${tab.name}-id`).then((tabId) => {
        TAB_SLUG_MAP[tab.name] = `${tabId}-${tab.name}`;
      });
    });

    H.editDashboard();

    H.getDashboardCard().realHover().icon("click").click();
    cy.get("aside").findByText(FILTER_MAPPING_COLUMN).click();
    addDashboardDestination();
    cy.get("aside")
      .findByLabelText("Select a dashboard tab")
      .should("have.value", TAB_1.name)
      .click();
    cy.findByRole("listbox").findByText(TAB_2.name).click();
    cy.get("aside").findByText(DASHBOARD_TEXT_FILTER.name).click();
    H.popover().findByText(FILTER_MAPPING_COLUMN).click();

    cy.get("aside").button("Done").click();
    H.saveDashboard();

    // test click behavior routing to same dashboard, different tab
    getTableCell(1).click();
    cy.get("@targetDashboardId").then((targetDashboardId) => {
      cy.location().should(({ pathname, search }) => {
        expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
        expect(search).to.equal(
          `?${DASHBOARD_FILTER_TEXT.slug}=${1}&tab=${TAB_SLUG_MAP[TAB_2.name]}`,
        );
      });
    });
  });

  it("should pass pivot headers and non-null values to custom URL click behavior (metabase#25203)", () => {
    const pivotQuery = {
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
    };

    H.createDashboardWithQuestions({
      dashboardName: "Click Behavior Custom URL Dashboard",
      questions: [
        {
          name: "Cypress Pivot Table",
          query: pivotQuery,
          display: "pivot",
        },
        {
          name: "Cypress Table Pivoted",
          query: pivotQuery,
          display: "table",
        },
        {
          name: "Orders",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["sum", ["field", ORDERS.TOTAL, null]],
              ["sum", ["field", ORDERS.DISCOUNT, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
            filter: ["=", ["field", ORDERS.USER_ID, null], 1],
          },
          display: "bar",
        },
      ],
      cards: [
        { row: 0, col: 0, size_x: 16, size_y: 8 },
        { row: 8, col: 0, size_x: 16, size_y: 8 },
        { row: 16, col: 0, size_x: 16, size_y: 8 },
      ],
    }).then(({ dashboard }) => {
      cy.wrap(dashboard.id).as("targetDashboardId");
      H.visitDashboard(dashboard.id);
    });

    const setUrl = (template) => {
      addUrlDestination();
      H.modal().within(() => {
        cy.get("@targetDashboardId").then((targetDashboardId) => {
          cy.findAllByRole("textbox")
            .eq(0)
            .type(
              `http://localhost:4000/dashboard/${targetDashboardId}${template}`,
              {
                parseSpecialCharSequences: false,
              },
            );
        });
        cy.button("Done").click();
      });
      cy.get("aside").button("Done").click();
    };

    const assertLocationSearch = (expectedSearch) => {
      cy.get("@targetDashboardId").then((targetDashboardId) => {
        cy.location().should(({ pathname, search }) => {
          expect(pathname).to.equal(`/dashboard/${targetDashboardId}`);
          expect(search).to.equal(expectedSearch);
        });
      });
    };

    H.editDashboard();

    H.getDashboardCard(0).realHover().icon("click").click();
    setUrl("?source={{source}}&category={{category}}&count={{count}}");

    H.getDashboardCard(1).realHover().icon("click").click();
    cy.get("aside").findByText("User → Source").click();
    setUrl("?source={{source}}");

    H.getDashboardCard(2).realHover().icon("click").click();
    setUrl("?discount={{sum_2}}&total={{sum}}");

    H.saveDashboard();

    cy.log("pivot table: top header row");
    H.getDashboardCard(0).findByText("Doohickey").click();
    assertLocationSearch("?category=Doohickey&count=&source=");

    cy.log("pivot table: left header row");
    H.getDashboardCard(0).findByText("Affiliate").click();
    assertLocationSearch("?category=&count=&source=Affiliate");

    cy.log("pivoted regular table: pivot column");
    H.getDashboardCard(1).findByText("Organic").click();
    assertLocationSearch("?source=Organic");

    cy.log("bar chart: normal values still work properly");
    H.getDashboardCard(2).within(() => {
      H.chartPathWithFillColor("#88BF4D").eq(2).click();
    });
    assertLocationSearch(
      "?discount=15.070632139056723&total=298.9195210424866",
    );

    cy.log("bar chart: null and empty values do not get passed through");
    H.getDashboardCard(2).within(() => {
      H.chartPathWithFillColor("#88BF4D").eq(1).click();
    });
    assertLocationSearch("?discount=&total=420.3189231596888");
  });

  it("should navigate to correct dashboard tab via custom destination click behavior (metabase#34447 metabase#44106)", () => {
    H.createDashboardWithTabs({
      name: TARGET_DASHBOARD.name,
      tabs: [
        {
          id: -1,
          name: "first-tab",
        },
        {
          id: -2,
          name: "second-tab",
        },
      ],
    }).then((targetDashboard) => {
      const baseClickBehavior = {
        type: "link",
        linkType: "dashboard",
        targetId: targetDashboard.id,
        parameterMapping: {},
      };

      const [firstTab, secondTab] = targetDashboard.tabs;

      H.createDashboard({
        dashcards: [
          createMockDashboardCard({
            id: -1,
            card_id: ORDERS_QUESTION_ID,
            size_x: 12,
            size_y: 6,
            visualization_settings: {
              column_settings: {
                '["name","PRODUCT_ID"]': {
                  click_behavior: {
                    ...baseClickBehavior,
                    tabId: firstTab.id,
                  },
                },
              },
            },
          }),
          createMockDashboardCard({
            id: -2,
            card_id: ORDERS_QUESTION_ID,
            size_x: 12,
            size_y: 6,
            visualization_settings: {
              column_settings: {
                '["name","PRODUCT_ID"]': {
                  click_behavior: {
                    ...baseClickBehavior,
                    tabId: secondTab.id,
                  },
                },
              },
            },
          }),
        ],
      }).then(({ body: dashboard }) => {
        H.visitDashboard(dashboard.id);

        H.getDashboardCard(1).findByText("14").click();
        cy.location("pathname").should(
          "eq",
          `/dashboard/${targetDashboard.id}`,
        );
        cy.location("search").should("eq", `?tab=${secondTab.id}-second-tab`);

        cy.go("back");
        cy.location("pathname").should("eq", `/dashboard/${dashboard.id}`);
        cy.location("search").should("eq", "");

        H.getDashboardCard(0).findByText("14").click();
        cy.location("pathname").should(
          "eq",
          `/dashboard/${targetDashboard.id}`,
        );
        cy.location("search").should("eq", `?tab=${firstTab.id}-first-tab`);
      });
    });
  });

  it("should allow to map numeric columns to user attributes", () => {
    cy.log("set user attributes");
    cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, {
      login_attributes: { attr_uid: NORMAL_USER_ID },
    });

    cy.log("setup a click behavior");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.showDashboardCardActions();
    H.getDashboardCard().findByLabelText("Click behavior").click();
    H.sidebar().within(() => {
      cy.findByText("Product ID").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });
    H.entityPickerModal().within(() => {
      cy.findByText("Orders").click();
    });
    cy.findByTestId("click-mappings").findByText("Product ID").click();
    H.popover().findByText("attr_uid").click();
    H.saveDashboard();

    cy.log("login as a user with a user attribute and ad-hoc query access");
    cy.signInAsNormalUser();

    cy.log("visit the dashboard and click on a cell with the click behavior");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.getDashboardCard().findByText("123").click();
    H.queryBuilderFiltersPanel()
      .findByText(`Product ID is ${NORMAL_USER_ID}`)
      .should("be.visible");
  });
});

describe("scenarios > dashboard > dashboard cards > click behavior > native question", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should handle URL click through with hidden columns, pivot tables and custom formatting (metabase#13927, metabase#17920, metabase#14597)", () => {
    const hiddenColumnQuestion = {
      name: "13927",
      native: { query: "SELECT PEOPLE.STATE, PEOPLE.CITY from PEOPLE;" },
    };
    const hiddenColumnDashcardSettings = {
      "table.cell_column": "CITY",
      "table.pivot_column": "STATE",
      column_settings: {
        '["name","CITY"]': {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTextTemplate:
              "Click to find out which state does {{CITY}} belong to.",
            linkTemplate: "/test/{{STATE}}",
          },
        },
      },
      "table.columns": [
        {
          name: "STATE",
          fieldRef: ["field", "STATE", { "base-type": "type/Text" }],
          enabled: false,
        },
        {
          name: "CITY",
          fieldRef: ["field", "CITY", { "base-type": "type/Text" }],
          enabled: true,
        },
      ],
    };

    const pivotQuestion = {
      name: "17920",
      native: {
        query:
          "SELECT STATE, SOURCE, COUNT(*) AS CNT from PEOPLE GROUP BY STATE, SOURCE",
      },
      display: "table",
      visualization_settings: {
        "table.pivot": true,
        "table.pivot_column": "SOURCE",
        "table.cell_column": "CNT",
      },
    };
    const pivotDashcardSettings = {
      column_settings: {
        [JSON.stringify(["name", "CNT"])]: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "/test/{{CNT}}/{{STATE}}/{{SOURCE}}",
          },
        },
      },
    };

    const formattedColumnKey = JSON.stringify(["name", "MY_NUMBER"]);
    const formattedQuestion = {
      name: "14597",
      native: { query: "select 111 as my_number, 'foo' as my_string" },
      display: "table",
      visualization_settings: {
        column_settings: {
          [formattedColumnKey]: {
            number_style: "currency",
            currency_style: "code",
            currency_in_header: false,
          },
        },
      },
    };
    const formattedDashcardSettings = {
      column_settings: {
        [formattedColumnKey]: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "/it/worked",
          },
        },
      },
    };

    H.createNativeQuestion(hiddenColumnQuestion).then(
      ({ body: { id: hiddenColumnQuestionId } }) => {
        H.createNativeQuestion(pivotQuestion).then(
          ({ body: { id: pivotQuestionId } }) => {
            H.createNativeQuestion(formattedQuestion).then(
              ({ body: { id: formattedQuestionId } }) => {
                H.createDashboard().then(({ body: { id: dashboardId } }) => {
                  H.updateDashboardCards({
                    dashboard_id: dashboardId,
                    cards: [
                      {
                        card_id: hiddenColumnQuestionId,
                        row: 0,
                        col: 0,
                        size_x: 11,
                        size_y: 6,
                        visualization_settings: hiddenColumnDashcardSettings,
                      },
                      {
                        card_id: pivotQuestionId,
                        row: 0,
                        col: 12,
                        visualization_settings: pivotDashcardSettings,
                      },
                      {
                        card_id: formattedQuestionId,
                        row: 8,
                        col: 0,
                        visualization_settings: formattedDashcardSettings,
                      },
                    ],
                  });
                  H.visitDashboard(dashboardId);
                });
              },
            );
          },
        );
      },
    );

    cy.log("metabase#13927: insert values from a hidden column");
    H.getDashboardCard(0)
      .findByText("Click to find out which state does Rye belong to.")
      .click();
    cy.location("pathname").should("eq", "/test/CO");

    cy.go("back");

    cy.log("metabase#17920: insert data from the correct row of a pivot table");
    H.getDashboardCard(1).within(() => {
      H.tableInteractiveBody()
        .findAllByRole("row")
        .eq(5)
        .findByText("18")
        .as("targetCell");
    });
    // querying the element before clicking to ensure its stability
    cy.get("@targetCell").click({ force: true });
    cy.location("pathname").should("eq", "/test/18/CO/Organic");

    cy.go("back");

    cy.log("metabase#14597: keep custom formatting");
    H.getDashboardCard(2).findByText("USD 111.00").click();
    cy.location("pathname").should("eq", "/it/worked");
  });

  it("should handle dashboard, question and URL click through on a table, including a URL to the same dashboard (metabase#22702)", () => {
    createQuestion((questionId) => {
      createDashboard(
        { dashboardName: "start dash", questionId, dashcardCount: 4 },
        (dashboardIdA) => {
          cy.wrap(dashboardIdA).as("dashboardIdA");
          createDashboardWithQuestion(
            { dashboardName: "end dash" },
            (dashboardIdB) => {
              cy.wrap(dashboardIdB).as("dashboardIdB");
              H.visitDashboard(dashboardIdA);
            },
          );
        },
      );
    });
    cy.icon("pencil").click();

    cy.log("configure clicks on MY_NUMBER to go to a dashboard");
    H.clickBehaviorSidebar(0);
    H.sidebar()
      .findByText("On-click behavior for each column")
      .parent()
      .parent()
      .within(() => {
        cy.findByText("MY_NUMBER").click();
      });
    H.sidebar().findByText("Go to a custom destination").click();
    H.sidebar()
      .findByText("Link to")
      .parent()
      .within(() => {
        cy.findByText("Dashboard").click();
      });
    H.entityPickerModal().within(() => {
      cy.findByText("end dash").click();
    });
    H.sidebar()
      .findByText("Available filters")
      .parent()
      .within(() => {
        cy.findByText("My Param").click();
      });
    H.selectDropdown().findByText("MY_STRING").click();

    cy.log("set the text template");
    H.sidebar()
      .findByPlaceholderText("E.x. Details for {{Column Name}}")
      .type("text: {{my_string}}", { parseSpecialCharSequences: false });
    H.sidebar().button("Done").click();

    cy.log("configure clicks on MY_NUMBER to go to a saved question");
    H.clickBehaviorSidebar(1).within(() => {
      cy.findByText("MY_NUMBER").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });

    H.modal().findByText("Orders").click();

    H.sidebar().findByText("User ID").click();
    H.popover().findByText("MY_NUMBER").click();

    H.sidebar().findByText("Product → Category").click();
    H.popover().findByText("My Param").click();

    H.sidebar()
      .findByLabelText(/Customize link text/)
      .type("num: {{my_number}}", {
        parseSpecialCharSequences: false,
      });
    H.sidebar().button("Done").click();

    cy.log("configure a URL click through on the MY_NUMBER column");
    H.clickBehaviorSidebar(2).within(() => {
      cy.findByText("MY_NUMBER").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("URL").click();
    });

    H.modal().within(() => {
      cy.get("input").first().type("/foo/{{my_number}}/{{my_param}}", {
        parseSpecialCharSequences: false,
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.get("input")
        .last()
        .type("column value: {{my_number}}", {
          parseSpecialCharSequences: false,
        })
        .blur();
      cy.findByText("Done").click();
    });
    H.sidebar().button("Done").click();

    cy.log("configure a URL to the same dashboard on the fourth card");
    H.clickBehaviorSidebar(3).within(() => {
      cy.findByText("MY_NUMBER").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("URL").click();
    });

    H.modal().within(() => {
      cy.get("@dashboardIdA").then((dashboardIdA) => {
        cy.get("input")
          .first()
          .type(`/dashboard/${dashboardIdA}?my_param=Aaron Hand`, { delay: 0 });
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.get("input").last().type("Click behavior", { delay: 0 }).blur();
      cy.button("Done").click();
    });

    H.saveDashboard();

    cy.log("dashboard click through");
    H.getDashboardCard(0).findByText("text: foo").click();

    cy.get("@dashboardIdB").then((dashboardIdB) => {
      cy.location("pathname").should("eq", `/dashboard/${dashboardIdB}`);
    });
    H.dashboardHeader().findByText("end dash").should("be.visible");
    cy.location("search").should("eq", "?my_param=foo");
    H.filterWidget().findByText("foo");

    cy.go("back");
    cy.get("@dashboardIdA").then((dashboardIdA) => {
      cy.location("pathname").should("eq", `/dashboard/${dashboardIdA}`);
    });
    cy.location("search").should("eq", "");

    cy.log("question click through");
    setParamValue("My Param", "Widget");
    H.getDashboardCard(1).findByText("num: 111").click();

    H.queryBuilderHeader().findByText("Orders").should("be.visible");
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("User ID is 111").should("be.visible");
      cy.findByText("Product → Category is Widget").should("be.visible");
    });
    H.assertQueryBuilderRowCount(5);

    cy.go("back");
    cy.get("@dashboardIdA").then((dashboardIdA) => {
      cy.location("pathname").should("eq", `/dashboard/${dashboardIdA}`);
    });

    cy.log("metabase#22702: open the same dashboard");
    H.getDashboardCard(3).findByText("Click behavior").click();
    H.filterWidget().findByText("Aaron Hand").should("be.visible");
    cy.get("@dashboardIdA").then((dashboardIdA) => {
      cy.location("pathname").should("eq", `/dashboard/${dashboardIdA}`);
    });
    cy.location("search").should("eq", "?my_param=Aaron+Hand");

    H.clearFilterWidget();
    cy.location("search").should("eq", "");

    setParamValue("My Param", "param-value");

    cy.log("click value and confirm url updates");
    H.getDashboardCard(2).findByText("column value: 111").click();
    cy.location("pathname").should("eq", "/foo/111/param-value");
  });

  it("should not remove click behavior on 'reset to defaults' (metabase#14919)", () => {
    const LINK_NAME = "Home";

    H.createQuestion({
      name: "14919",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: QUESTION_ID } }) => {
      H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
        // Add previously added question to the dashboard
        H.addOrUpdateDashboardCard({
          card_id: QUESTION_ID,
          dashboard_id: DASHBOARD_ID,
          card: {
            // Add click through behavior to that question
            visualization_settings: {
              column_settings: {
                [`["ref",["field-id",${PRODUCTS.CATEGORY}]]`]: {
                  click_behavior: {
                    type: "link",
                    linkType: "url",
                    linkTemplate: "/",
                    linkTextTemplate: LINK_NAME,
                  },
                },
              },
            },
          },
        });

        H.visitDashboard(DASHBOARD_ID);
        cy.icon("pencil").click();
        // Edit "Visualization options"
        H.showDashboardCardActions();
        cy.icon("palette").click();
        H.modal().within(() => {
          cy.findByText("Reset to defaults").click();
          cy.button("Done").click();
        });
        // Save the whole dashboard
        cy.button("Save").click();
        cy.findByText("You're editing this dashboard.").should("not.exist");
        cy.log("Reported failing on v0.38.0 - link gets dropped");
        cy.findByTestId("dashcard-container").findAllByText(LINK_NAME);
      });
    });
  });
});

describe("issue 16334", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should not change the visualization type in a targetted question with mapped filter (metabase#16334)", () => {
    // Question 2, that we're adding to the dashboard
    const questionDetails = {
      query: {
        "source-table": REVIEWS_ID,
      },
    };

    H.createQuestion({
      name: "16334",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "pie",
    }).then(({ body: { id: question1Id } }) => {
      H.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { id, card_id, dashboard_id } }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id,
            card_id,
            card: {
              id,
              visualization_settings: getVisualizationSettings(question1Id),
            },
          });

          H.visitDashboard(dashboard_id);
          cy.wait("@dashcardQuery");
        },
      );
    });

    cy.findAllByTestId("cell-data").contains("5").first().click();
    cy.wait("@dataset");

    // Make sure filter is set
    cy.findByTestId("qb-filters-panel").should(
      "contain.text",
      "Rating is equal to 5",
    );

    // Make sure it's connected to the original question
    cy.findByTestId("app-bar").should("contain.text", "Started from 16334");

    // Make sure the original visualization didn't change
    H.pieSlices().should("have.length", 2);

    const getVisualizationSettings = (targetId) => ({
      column_settings: {
        [`["ref",["field",${REVIEWS.RATING},null]]`]: {
          click_behavior: {
            targetId,
            parameterMapping: {
              [`["dimension",["field",${PRODUCTS.RATING},null],{"stage-number":0}]`]:
                {
                  source: {
                    type: "column",
                    id: "RATING",
                    name: "Rating",
                  },
                  target: {
                    type: "dimension",
                    id: [
                      `["dimension",["field",${PRODUCTS.RATING},null],{"stage-number":0}]`,
                    ],
                    dimension: [
                      "dimension",
                      ["field", PRODUCTS.RATING, null],
                      { "stage-number": 0 },
                    ],
                  },
                  id: [
                    `["dimension",["field",${PRODUCTS.RATING},null],{"stage-number":0}]`,
                  ],
                },
            },
            linkType: "question",
            type: "link",
          },
        },
      },
    });
  });
});

describe("issue 17160", () => {
  const TARGET_DASHBOARD_NAME = "Target dashboard";
  const CATEGORY_FILTER_PARAMETER_ID = "7c9ege62";

  function assertMultipleValuesFilterState() {
    cy.findByText("2 selections").click();

    cy.findByLabelText("Doohickey").should("be.checked");
    cy.findByLabelText("Gadget").should("be.checked");
  }

  function setup() {
    H.createNativeQuestion({
      name: "17160Q",
      native: {
        query: "SELECT * FROM products WHERE {{CATEGORY}}",
        "template-tags": {
          CATEGORY: {
            id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
            name: "CATEGORY",
            display_name: "CATEGORY",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "category",
            default: null,
          },
        },
      },
    }).then(({ body: { id: questionId } }) => {
      H.createDashboard({ name: "17160D" }).then(
        ({ body: { id: dashboardId } }) => {
          cy.wrap(dashboardId).as("sourceDashboardId");

          // Add the question to the dashboard
          H.addOrUpdateDashboardCard({
            dashboard_id: dashboardId,
            card_id: questionId,
          }).then(({ body: { id: dashCardId } }) => {
            // Add dashboard filter
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
              parameters: [
                {
                  default: ["Doohickey", "Gadget"],
                  id: CATEGORY_FILTER_PARAMETER_ID,
                  name: "Category",
                  slug: "category",
                  sectionId: "string",
                  type: "string/=",
                },
              ],
            });

            createTargetDashboard().then((targetDashboardId) => {
              cy.wrap(targetDashboardId).as("targetDashboardId");

              // Create a click behaviour for the question card
              cy.request("PUT", `/api/dashboard/${dashboardId}`, {
                dashcards: [
                  {
                    id: dashCardId,
                    card_id: questionId,
                    row: 0,
                    col: 0,
                    size_x: 16,
                    size_y: 10,
                    parameter_mappings: [
                      {
                        parameter_id: CATEGORY_FILTER_PARAMETER_ID,
                        card_id: 4,
                        target: ["dimension", ["template-tag", "CATEGORY"]],
                      },
                    ],
                    visualization_settings: getVisualSettingsWithClickBehavior(
                      questionId,
                      targetDashboardId,
                    ),
                  },
                ],
              });
            });
          });
        },
      );
    });
  }

  function getVisualSettingsWithClickBehavior(questionTarget, dashboardTarget) {
    return {
      column_settings: {
        '["name","ID"]': {
          click_behavior: {
            targetId: questionTarget,
            parameterMapping: {
              "6b8b10ef-0104-1047-1e1b-2492d5954322": {
                source: {
                  type: "parameter",
                  id: CATEGORY_FILTER_PARAMETER_ID,
                  name: "Category",
                },
                target: {
                  type: "variable",
                  id: "CATEGORY",
                },
                id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
              },
            },
            linkType: "question",
            type: "link",
            linkTextTemplate: "click-behavior-question-label",
          },
        },

        '["name","EAN"]': {
          click_behavior: {
            targetId: dashboardTarget,
            parameterMapping: {
              dd19ec03: {
                source: {
                  type: "parameter",
                  id: CATEGORY_FILTER_PARAMETER_ID,
                  name: "Category",
                },
                target: {
                  type: "parameter",
                  id: "dd19ec03",
                },
                id: "dd19ec03",
              },
            },
            linkType: "dashboard",
            type: "link",
            linkTextTemplate: "click-behavior-dashboard-label",
          },
        },
      },
    };
  }

  function createTargetDashboard() {
    return H.createQuestionAndDashboard({
      dashboardDetails: {
        name: TARGET_DASHBOARD_NAME,
      },
      questionDetails: {
        query: {
          "source-table": PRODUCTS_ID,
        },
      },
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      // Add a filter
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters: [
          {
            name: "Category",
            slug: "category",
            id: "dd19ec03",
            type: "string/=",
            sectionId: "string",
          },
        ],
      });

      // Resize the question card and connect the filter to it
      return cy
        .request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: "dd19ec03",
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        })
        .then(() => {
          return dashboard_id;
        });
    });
  }

  function visitSourceDashboard() {
    cy.get("@sourceDashboardId").then((id) => {
      H.visitDashboard(id);
    });
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should pass multiple filter values to questions and dashboards (metabase#17160-1)", () => {
    setup();

    // 1. Check click behavior connected to a question
    visitSourceDashboard();

    cy.findAllByText("click-behavior-question-label").eq(0).click();
    cy.wait("@cardQuery");

    cy.url().should("include", "/question");

    assertMultipleValuesFilterState();

    // 2. Check click behavior connected to a dashboard
    visitSourceDashboard();

    cy.get("@targetDashboardId").then((id) => {
      cy.intercept("POST", `/api/dashboard/${id}/dashcard/*/card/*/query`).as(
        "targetDashcardQuery",
      );

      cy.findAllByText("click-behavior-dashboard-label").eq(0).click();
      cy.wait("@targetDashcardQuery");
    });

    cy.url().should("include", "/dashboard");
    cy.location("search").should("eq", "?category=Doohickey&category=Gadget");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(TARGET_DASHBOARD_NAME);

    assertMultipleValuesFilterState();
  });
});

describe("issue 23137", () => {
  const GAUGE_QUESTION_DETAILS = {
    display: "gauge",
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
    },
  };

  const PROGRESS_QUESTION_DETAILS = {
    display: "progress",
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should navigate to a target from gauge and progress cards (metabase#23137)", () => {
    const visualization_settings = {
      click_behavior: {
        type: "link",
        linkType: "question",
        targetId: ORDERS_QUESTION_ID,
        parameterMapping: {},
      },
    };

    H.createDashboardWithQuestions({
      questions: [GAUGE_QUESTION_DETAILS, PROGRESS_QUESTION_DETAILS],
      cards: [
        { row: 0, col: 0, visualization_settings },
        { row: 0, col: 12, visualization_settings },
      ],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
    });

    cy.log("gauge");
    H.getDashboardCard(0).findByTestId("gauge-arc-1").click();
    cy.wait("@cardQuery");
    H.queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");

    cy.go("back");

    cy.log("progress");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    H.getDashboardCard(1).findByTestId("progress-bar").click();
    cy.wait("@cardQuery");
    H.queryBuilderHeader().findByDisplayValue("Orders").should("be.visible");
  });
});

describe("issue 46318", () => {
  const query = `SELECT 'group_1' AS main_group, 'sub_group_1' AS sub_group, 111 AS value_sum, 'group_1__sub_group_1' AS group_name
UNION ALL
SELECT 'group_1', 'sub_group_2', 68, 'group_1__sub_group_2'
UNION ALL
SELECT 'group_2', 'sub_group_1', 79, 'group_2__sub_group_1'
UNION ALL
SELECT 'group_2', 'sub_group_2', 52, 'group_2__sub_group_2';
`;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({
      questionDetails: {
        name: "46318",
        native: { query },
        display: "row",
        visualization_settings: {
          "graph.dimensions": ["MAIN_GROUP", "SUB_GROUP"],
          "graph.series_order_dimension": null,
          "graph.series_order": null,
          "graph.metrics": ["VALUE_SUM"],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });

    H.editDashboard();
    H.getDashboardCard().realHover().icon("click").click();
    cy.get("aside").within(() => {
      cy.findByText("Go to a custom destination").click();
      cy.findByText("URL").click();
    });
    H.modal().within(() => {
      cy.findByPlaceholderText("e.g. http://acme.com/id/{{user_id}}").type(
        "http://localhost:4000/?q={{group_name}}",
        { parseSpecialCharSequences: false },
      );
      cy.button("Done").click();
    });
    H.saveDashboard();
  });

  it("passes values from unused columns of row visualization to click behavior (metabase#46318)", () => {
    cy.findAllByRole("graphics-symbol").eq(0).click();
    cy.location("href").should(
      "eq",
      "http://localhost:4000/?q=group_1__sub_group_1",
    );

    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(2).click(); // intentionally eq(2), not eq(1) - that's how row viz works
    cy.location("href").should(
      "eq",
      "http://localhost:4000/?q=group_1__sub_group_2",
    );

    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(1).click(); // intentionally eq(1), not eq(2) - that's how row viz works
    cy.location("href").should(
      "eq",
      "http://localhost:4000/?q=group_2__sub_group_1",
    );
    cy.go("back");

    cy.findAllByRole("graphics-symbol").eq(3).click();
    cy.location("href").should(
      "eq",
      "http://localhost:4000/?q=group_2__sub_group_2",
    );
  });
});

describe("issue 17879", () => {
  const RAW_TARGET_NAME = "Q1 raw - 17879";
  const MONTH_TARGET_NAME = "Q1 month - 17879";

  const CASES = [
    {
      sourceDateUnit: "month",
      targetName: RAW_TARGET_NAME,
      expectedFilterText: "Created At is Apr 1–30, 2025",
    },
    {
      sourceDateUnit: "week",
      targetName: RAW_TARGET_NAME,
      expectedFilterText: "Created At is Apr 27 – May 3, 2025",
    },
    {
      sourceDateUnit: "year",
      targetName: RAW_TARGET_NAME,
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2025",
    },
    {
      sourceDateUnit: "year",
      targetName: MONTH_TARGET_NAME,
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2025",
    },
  ];

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should map dashcard date parameter to correct date range filter in target question (metabase#17879)", () => {
    H.createQuestion({
      name: RAW_TARGET_NAME,
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    });
    H.createQuestion({
      name: MONTH_TARGET_NAME,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        limit: 5,
      },
    });

    H.createDashboardWithQuestions({
      dashboardName: "Dashboard with aggregated Q2",
      questions: CASES.map(({ sourceDateUnit, targetName }) => ({
        name: `Q2 ${sourceDateUnit} to ${targetName}`,
        display: "line",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": sourceDateUnit }],
          ],
          limit: 5,
        },
      })),
      cards: [
        { row: 0, col: 0 },
        { row: 0, col: 12 },
        { row: 8, col: 0 },
        { row: 8, col: 12 },
      ],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
    });

    H.editDashboard();

    CASES.forEach(({ sourceDateUnit, targetName }, index) => {
      H.clickBehaviorSidebar(index).within(() => {
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Saved question").click();
      });
      H.entityPickerModal().findByText(targetName).click();
      H.sidebar().findByText("Created At").click();
      H.popover()
        .findByText(`Created At: ${capitalize(sourceDateUnit)}`)
        .click();
      H.sidebar().button("Done").click();
    });

    H.saveDashboard();

    CASES.forEach(({ expectedFilterText }, index) => {
      H.getDashboardCard(index)
        .scrollIntoView()
        .within(() => {
          H.cartesianChartCircle().first().click({ force: true });
        });

      cy.url().should("include", "/question");
      cy.findByTestId("qb-filters-panel").should(
        "have.text",
        expectedFilterText,
      );

      cy.go("back");
    });
  });
});

describe("issue 56716", () => {
  function setupDashboard() {
    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        fields: [
          ["field", PRODUCTS.ID, null],
          ["field", PRODUCTS.RATING, null],
        ],
      },
    };

    const parameterDetails = {
      id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
      type: "number/=",
      target: ["dimension", ["field", PRODUCTS.RATING, null]],
      name: "Number",
      slug: "number",
    };

    const dashboardDetails = {
      parameters: [parameterDetails],
    };

    const vizSettings = {
      column_settings: {
        '["name","RATING"]': {
          click_behavior: {
            type: "crossfilter",
            parameterMapping: {
              [parameterDetails.id]: {
                id: parameterDetails.id,
                source: { id: "RATING", name: "RATING", type: "column" },
                target: {
                  id: parameterDetails.id,
                  type: "parameter",
                },
              },
            },
          },
        },
      },
    };

    const getParameterMapping = (cardId) => ({
      card_id: cardId,
      parameter_id: parameterDetails.id,
      target: ["dimension", ["field", PRODUCTS.RATING, null]],
    });

    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashcard, questionId }) => {
      const { dashboard_id } = dashcard;

      H.editDashboardCard(dashcard, {
        parameter_mappings: [getParameterMapping(questionId)],
        visualization_settings: vizSettings,
      });

      H.visitDashboard(dashboard_id);
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should reset the filter when clicking on a column value twice with a click behavior enabled (metabase#56716)", () => {
    setupDashboard();

    H.getDashboardCard().findByText("4.6").click();
    H.filterWidget().should("contain.text", "4.6");
    H.getDashboardCard().findByText("4 rows").should("be.visible");

    H.getDashboardCard().findAllByText("4.6").first().click();
    H.filterWidget().should("not.contain.text", "4.6");
    H.getDashboardCard().findByText("200 rows").should("be.visible");
  });
});

describe("issue 58556, issue 66277", () => {
  const QUESTION = {
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "hour" }]],
    },
    display: "table",
  };

  const PARAMETER = createMockParameter({
    id: "date-param",
    name: "Date",
    slug: "date",
    type: "date/all-options",
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createDashboardWithQuestions({
      questions: [QUESTION],
      dashboardDetails: {
        parameters: [PARAMETER],
      },
    }).then(({ dashboard }) => {
      cy.request("GET", `/api/dashboard/${dashboard.id}`).then(
        ({ body: dashboard }) => {
          const [dashcard] = dashboard.dashcards;
          const parameter_mappings = [
            {
              card_id: dashcard.card_id,
              parameter_id: PARAMETER.id,
              target: [
                "dimension",
                [
                  "field",
                  "CREATED_AT",
                  {
                    "base-type": "type/DateTime",
                    "inherited-temporal-unit": "hour",
                  },
                ],
                {
                  "stage-number": 1,
                },
              ],
            },
          ];

          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            dashcards: [
              {
                ...dashcard,
                col: 0,
                size_x: 12,
                parameter_mappings,
              },
              {
                ...dashcard,
                id: -1,
                col: 12,
                size_x: 12,
                parameter_mappings,
              },
            ],
          });
        },
      );

      H.visitDashboard(dashboard.id);
    });

    H.editDashboard();
  });

  it("should keep the time of an hour column in click behavior parameters (metabase#58556, metabase#66277)", () => {
    cy.log("metabase#66277: go to a saved question");
    H.clickBehaviorSidebar(1).within(() => {
      cy.findByText("Created At: Hour").click();
      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
    });

    H.entityPickerModal().findByText("Orders").click();

    H.sidebar().findByText("Created At").scrollIntoView().click();

    H.popover().findByText("Created At: Hour").click();
    H.sidebar().button("Done").click();

    cy.log("metabase#58556: update a dashboard filter");
    H.clickBehaviorSidebar(0).within(() => {
      cy.findByText("Created At: Hour").click();
      cy.findByText("Update a dashboard filter").click();
      cy.findByText("Date").click();
    });

    H.popover().findByText("Created At: Hour").click();
    H.sidebar().button("Done").click();

    H.saveDashboard();

    cy.log("metabase#66277: click a row of the second card");
    H.getDashboardCard(1)
      .findByTestId("table-body")
      .findAllByTestId("link-formatted-text")
      .eq(0)
      .click();

    H.queryBuilderFiltersPanel()
      .findByText(
        /Created At is .* \d{1,2}:\d{2} (AM|PM) – \d{1,2}:\d{2} (AM|PM)/,
      )
      .should("be.visible");

    cy.go("back");

    cy.log("metabase#58556: click a row of the first card");
    H.getDashboardCard(0)
      .findByTestId("table-body")
      .findAllByTestId("link-formatted-text")
      .eq(0)
      .click();

    cy.log("ensure the filter contains a time value");
    cy.location("search").should((search) => {
      expect(new URLSearchParams(search).get("date")).to.match(
        /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
      );
    });
  });
});

describe("issue 15368", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should be possible to visit a dashboard with click-behavior linked to the dashboard without permissions (metabase#15368)", () => {
    cy.request("GET", "/api/user/current").then(
      ({ body: { personal_collection_id } }) => {
        // Save new dashboard in admin's personal collection
        cy.request("POST", "/api/dashboard", {
          name: "15368D",
          collection_id: personal_collection_id,
        }).then(({ body: { id: NEW_DASHBOARD_ID } }) => {
          const COLUMN_REF = `["ref",["field-id",${ORDERS.ID}]]`;
          // Add click behavior to the existing "Orders in a dashboard" dashboard
          cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
            dashcards: [
              {
                id: ORDERS_DASHBOARD_DASHCARD_ID,
                card_id: ORDERS_QUESTION_ID,
                row: 0,
                col: 0,
                size_x: 16,
                size_y: 8,
                series: [],
                visualization_settings: {
                  column_settings: {
                    [COLUMN_REF]: {
                      click_behavior: {
                        type: "link",
                        linkType: "dashboard",
                        parameterMapping: {},
                        targetId: NEW_DASHBOARD_ID,
                      },
                    },
                  },
                },
                parameter_mappings: [],
              },
            ],
          });

          cy.intercept(
            "GET",
            `/api/dashboard/${ORDERS_DASHBOARD_ID}/query_metadata*`,
          ).as("queryMetadata");
        });
      },
    );
    cy.signInAsNormalUser();
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.wait("@queryMetadata");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});

const clickLineChartPoint = ({ dashcardIndex } = {}) => {
  if (dashcardIndex === undefined) {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.cartesianChartCircle().eq(POINT_INDEX).as("linePoint");
  } else {
    H.getDashboardCard(dashcardIndex)
      .scrollIntoView()
      .within(() => {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.cartesianChartCircle().eq(POINT_INDEX).as("linePoint");
      });
  }

  cy.get("@linePoint")
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
  H.pickEntity({ path: ["Our analytics", TARGET_DASHBOARD.name] });
};

const addUrlDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("URL").click();
};

const addSavedQuestionDestination = () => {
  cy.get("aside").findByText("Go to a custom destination").click();
  cy.get("aside").findByText("Saved question").click();
  H.entityPickerModal().findByText(TARGET_QUESTION.name).click();
};

const addSavedQuestionCreatedAtParameter = () => {
  cy.get("aside")
    .findByTestId("click-mappings")
    .findByText("Created At")
    .click();
  H.popover().within(() => {
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
    cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
    cy.findByText(CREATED_AT_COLUMN_NAME).click();
  });
};

const addSavedQuestionQuantityParameter = () => {
  cy.get("aside").findByTestId("click-mappings").findByText("Quantity").click();
  H.popover().within(() => {
    cy.findByText(COUNT_COLUMN_NAME).should("exist");
    cy.findByText(CREATED_AT_COLUMN_NAME).should("not.exist");
    cy.findByText(COUNT_COLUMN_NAME).click();
  });
};

const addTextParameter = () => {
  cy.get("aside").findByText(DASHBOARD_FILTER_TEXT.name).click();
  H.popover().within(() => {
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
    cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
  });
};

const addTextWithDefaultParameter = () => {
  cy.get("aside").findByText(DASHBOARD_FILTER_TEXT_WITH_DEFAULT.name).click();
  H.popover().within(() => {
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
    cy.findByText(COUNT_COLUMN_NAME).should("exist").click();
  });
};

const addTimeParameter = () => {
  cy.get("aside").findByText(DASHBOARD_FILTER_TIME.name).click();
  H.popover().within(() => {
    cy.findByText(CREATED_AT_COLUMN_NAME).should("exist");
    cy.findByText(COUNT_COLUMN_NAME).should("not.exist");
    cy.findByText(CREATED_AT_COLUMN_NAME).click();
  });
};

const addNumericParameter = () => {
  cy.get("aside").findByText(DASHBOARD_FILTER_NUMBER.name).click();
  H.popover().within(() => {
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

const createTextFilterWithDefaultMapping = ({ card_id }) => {
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
    parameter_id: DASHBOARD_FILTER_TEXT_WITH_DEFAULT.id,
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
  H.popover()
    .should("contain", "See these Orders")
    .and("contain", "See this month by week")
    .and("contain", "Break out by…")
    .and("contain", "Automatic insights…")
    .and("contain", "Filter by this value");
};

const assertOnSourceDashboard = () => {
  cy.get("@sourceDashboardId").then((sourceDashboardId) => {
    cy.location("pathname").should("eq", `/dashboard/${sourceDashboardId}`);
  });
};

const testChangingBackToDefaultBehavior = () => {
  cy.log("allows to change click behavior back to the default");

  H.editDashboard();

  H.getDashboardCard().realHover().icon("click").click();
  cy.get("aside").icon("close").first().click();
  cy.get("aside").findByText("Open the Metabase drill-through menu").click();
  cy.get("aside").button("Done").click();

  H.saveDashboard();

  clickLineChartPoint();
  assertDrillThroughMenuOpen();
};

const getTableCell = (index) => {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return H.tableInteractiveBody()
    .findAllByRole("row")
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
  H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    if (options?.wrapId) {
      cy.wrap(dashboard.id).as(options.idAlias ?? "dashboardId");
    }
    cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
      ...dashboard,
      dashcards,
      tabs,
    }).then(({ body: dashboard }) => {
      dashboard.tabs.forEach((tab) => {
        cy.wrap(tab.id).as(`${tab.name}-id`);
      });
    });
  });
};

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function customizeLinkText(text) {
  cy.get("aside")
    .findByRole("textbox")
    .type(text, { parseSpecialCharSequences: false });
}

function verifyVizTypeIsLine() {
  H.openVizTypeSidebar();
  cy.findByTestId("sidebar-content")
    .findByTestId("Line-container")
    .should("have.attr", "aria-selected", "true");
  H.openVizTypeSidebar();
}

function getClickMapping(columnName) {
  return cy
    .get("aside")
    .findByTestId("unset-click-mappings")
    .findAllByText(columnName);
}

// Picks a source from the open click-mapping popover and waits for it to close.
// Applying a mapping re-renders the unset-mappings list; without this barrier the
// next index-based lookup (.first()/.last()/.eq()) can resolve mid-re-render and
// land on the wrong target, producing a stable-but-wrong filter set.
//
// The barrier scopes to the *visible* popover: a bare
// `cy.get(POPOVER_ELEMENT).should("not.exist")` never settles here because the
// click-behavior sidebar keeps ~60 mantine popover/combobox dropdowns
// mounted-but-hidden, so they are "continuously found" in the DOM. Filtering to
// `:visible` leaves only the open source picker, which disappears once selected.
function selectClickMappingSource(sourceName) {
  H.popover().findByText(sourceName).click();
  cy.get(H.POPOVER_ELEMENT).filter(":visible").should("not.exist");
}

function verifyAvailableClickTargetColumns(columns) {
  cy.get("aside").within(() => {
    for (let index = 0; index < columns.length; ++index) {
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("click-target-column")
        .eq(index)
        .should("have.text", columns[index]);
    }

    cy.findAllByTestId("click-target-column").should(
      "have.length",
      columns.length,
    );
  });
}

function createMultiStageQuery() {
  return {
    "source-query": {
      "source-table": ORDERS_ID,
      joins: [
        {
          strategy: "left-join",
          alias: "Reviews - Product",
          condition: [
            "=",
            [
              "field",
              ORDERS.PRODUCT_ID,
              {
                "base-type": "type/Integer",
              },
            ],
            [
              "field",
              "PRODUCT_ID",
              {
                "base-type": "type/Integer",
                "join-alias": "Reviews - Product",
              },
            ],
          ],
          "source-table": REVIEWS_ID,
        },
      ],
      expressions: {
        Net: [
          "-",
          [
            "field",
            ORDERS.TOTAL,
            {
              "base-type": "type/Float",
            },
          ],
          [
            "field",
            ORDERS.TAX,
            {
              "base-type": "type/Float",
            },
          ],
        ],
      },
      aggregation: [
        ["count"],
        [
          "sum",
          [
            "field",
            ORDERS.TOTAL,
            {
              "base-type": "type/Float",
            },
          ],
        ],
      ],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
        [
          "field",
          PRODUCTS.CATEGORY,
          {
            "base-type": "type/Text",
            "source-field": ORDERS.PRODUCT_ID,
          },
        ],
        [
          "field",
          PEOPLE.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "year",
            "source-field": ORDERS.USER_ID,
            "original-temporal-unit": "month",
          },
        ],
      ],
    },
    joins: [
      {
        strategy: "left-join",
        alias: "Reviews - Created At: Month",
        condition: [
          "=",
          [
            "field",
            "CREATED_AT",
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
              "original-temporal-unit": "month",
            },
          ],
          [
            "field",
            REVIEWS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
              "join-alias": "Reviews - Created At: Month",
              "original-temporal-unit": "month",
            },
          ],
        ],
        "source-table": REVIEWS_ID,
      },
    ],
    expressions: {
      "5 * Count": [
        "*",
        5,
        [
          "field",
          "count",
          {
            "base-type": "type/Integer",
          },
        ],
      ],
    },
    aggregation: [
      ["count"],
      [
        "sum",
        [
          "field",
          REVIEWS.RATING,
          {
            "base-type": "type/Integer",
            "join-alias": "Reviews - Created At: Month",
          },
        ],
      ],
    ],
    breakout: [
      [
        "field",
        "PRODUCTS__via__PRODUCT_ID__CATEGORY",
        {
          "base-type": "type/Text",
        },
      ],
      [
        "field",
        REVIEWS.CREATED_AT,
        {
          "base-type": "type/Text",
          "join-alias": "Reviews - Created At: Month",
        },
      ],
    ],
  };
}

function createDashboardWithQuestion(
  { dashboardName = "dashboard", dashcardCount = 1 } = {},
  callback,
) {
  createQuestion((questionId) => {
    createDashboard({ dashboardName, questionId, dashcardCount }, callback);
  });
}

function createQuestion(callback) {
  cy.request("POST", "/api/card", {
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "native",
      native: {
        query: "select 111 as my_number, 'foo' as my_string",
      },
    },
    display: "table",
    visualization_settings: {},
    name: "Question",
    collection_id: null,
  }).then(({ body: { id: questionId } }) => {
    callback(questionId);
  });
}

function createDashboard(
  { dashboardName = "dashboard", questionId, dashcardCount = 1 },
  callback,
) {
  H.createDashboard({ name: dashboardName }).then(
    ({ body: { id: dashboardId } }) => {
      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        parameters: [
          {
            name: "My Param",
            slug: "my_param",
            id: "e8f79be9",
            type: "category",
          },
        ],
      });

      H.updateDashboardCards({
        dashboard_id: dashboardId,
        cards: Array.from({ length: dashcardCount }, (_item, index) => ({
          card_id: questionId,
          col: (index % 2) * 12,
          row: Math.floor(index / 2) * 8,
          parameter_mappings: [
            {
              parameter_id: "e8f79be9",
              card_id: questionId,
              target: [
                "dimension",
                ["field", PEOPLE.NAME, { "source-field": ORDERS.USER_ID }],
              ],
            },
          ],
        })),
      }).then(() => callback(dashboardId));
    },
  );
}

function setParamValue(paramName, text) {
  // wait to leave editing mode and set a param value
  cy.findByText("You're editing this dashboard.").should("not.exist");
  cy.findByText(paramName).click();
  H.dashboardParametersPopover().within(() => {
    cy.findByPlaceholderText("Search the list").type(text);
    cy.findByText("Add filter").click();
  });
}
