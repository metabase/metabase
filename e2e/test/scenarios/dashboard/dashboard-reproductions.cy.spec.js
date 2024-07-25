import { assoc } from "icepick";
import _ from "underscore";

import { USER_GROUPS, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  addTextBox,
  editDashboard,
  getDashboardCard,
  openQuestionsSidebar,
  popover,
  removeDashboardCard,
  restore,
  saveDashboard,
  setFilter,
  showDashboardCardActions,
  sidebar,
  undo,
  visitDashboard,
  getDashboardCards,
  updateDashboardCards,
  rightSidebar,
  dashboardHeader,
  entityPickerModal,
  toggleDashboardInfoSidebar,
  cartesianChartCircle,
  undoToast,
  setTokenFeatures,
  describeEE,
  visitQuestion,
  getTextCardDetails,
  modal,
  queryBuilderHeader,
  filterWidget,
  dashboardParametersContainer,
  goToTab,
  createDashboardWithTabs,
  dashboardGrid,
} from "e2e/support/helpers";
import { createSegment } from "e2e/support/helpers/e2e-table-metadata-helpers";
import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import {
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const { SAMPLE_DATABASE } = require("e2e/support/cypress_sample_database");

const { ALL_USERS_GROUP, COLLECTION_GROUP } = USER_GROUPS;
const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS, PEOPLE } = SAMPLE_DATABASE;

describe("issue 12578", () => {
  const ORDERS_QUESTION = {
    name: "Orders question",
    query: {
      "source-table": ORDERS_ID,
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not fetch cards that are still loading when refreshing", () => {
    cy.clock(Date.now());
    cy.createQuestionAndDashboard({ questionDetails: ORDERS_QUESTION }).then(
      ({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      },
    );

    // Without tick the dashboard header will not load
    cy.tick();
    cy.findByLabelText("Auto Refresh").click();
    popover().findByText("1 minute").click();

    // Mock slow card request
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
      req.on("response", res => {
        res.setDelay(99999);
      });
    }).as("dashcardQuery");
    cy.tick(61 * 1000);
    cy.tick(61 * 1000);

    cy.get("@dashcardQuery.all").should("have.length", 1);
  });
});

describe("issue 12926", () => {
  const filterDisplayName = "F";
  const queryResult = 42;
  const parameterValue = 10;
  const questionDetails = {
    name: "Question 1",
    native: {
      query: `SELECT ${queryResult} [[+{{F}}]] as ANSWER`,
      "template-tags": {
        F: {
          type: "number",
          name: "F",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": filterDisplayName,
        },
      },
    },
  };

  function slowDownCardQuery(as) {
    cy.intercept("POST", "/api/card/*/query", req => {
      req.on("response", res => {
        res.setDelay(300000);
      });
    }).as(as);
  }

  function slowDownDashcardQuery() {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
      req.on("response", res => {
        res.setDelay(5000);
      });
    }).as("dashcardQuerySlowed");
  }

  function restoreDashcardQuery() {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
      // calling req.continue() will make cypress skip all previously added intercepts
      req.continue();
    }).as("dashcardQueryRestored");
  }

  function removeCard() {
    editDashboard();

    showDashboardCardActions();

    cy.findByTestId("dashboardcard-actions-panel")
      .findByLabelText("close icon")
      .click();
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("card removal while query is in progress", () => {
    it("should stop the ongoing query when removing a card from a dashboard", () => {
      slowDownDashcardQuery();

      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      });

      cy.window().then(win => {
        cy.spy(win.XMLHttpRequest.prototype, "abort").as("xhrAbort");
      });

      removeCard();

      cy.get("@xhrAbort").should("have.been.calledOnce");
    });

    it("should re-fetch the query when doing undo on the removal", () => {
      slowDownDashcardQuery();

      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      });

      removeCard();

      restoreDashcardQuery();

      undo();

      cy.wait("@dashcardQueryRestored");

      getDashboardCard().findByText(queryResult);
    });

    it("should not break virtual cards (metabase#35545)", () => {
      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        visitDashboard(dashboardId);
      });

      addTextBox("Text card content");

      removeDashboardCard();

      undo();

      getDashboardCard().findByText("Text card content");
    });
  });

  describe("saving a dashboard that retriggers a non saved query (negative id)", () => {
    it("should stop the ongoing query", () => {
      // this test requires the card to be manually added to the dashboard, as it requires the dashcard id to be negative
      cy.createNativeQuestion(questionDetails);

      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      openQuestionsSidebar();
      // when the card is added to a dashboard, it doesn't use the dashcard endpoint but instead uses the card one
      slowDownCardQuery("cardQuerySlowed");
      sidebar().findByText(questionDetails.name).click();

      setFilter("Number", "Equal to");
      sidebar().findByText("No default").click();
      popover().findByPlaceholderText("Enter a number").type(parameterValue);
      popover().findByText("Add filter").click();

      getDashboardCard().findByText("Select…").click();
      popover().contains(filterDisplayName).eq(0).click();

      saveDashboard();

      cy.wait("@cardQuerySlowed").then(xhrProxy =>
        expect(xhrProxy.state).to.eq("Errored"),
      );

      getDashboardCard().findByText(queryResult + parameterValue);
    });
  });
});

describe("issue 13736", () => {
  const questionDetails = {
    name: "Orders count",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should work even if some cards are broken (metabase#13736)", () => {
    cy.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "failingQuestionId",
    });
    cy.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "successfulQuestionId",
    });
    cy.createDashboard({ name: "13736 Dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      const dashboardId = this.dashboardId;
      const failingQuestionId = this.failingQuestionId;
      const successfulQuestionId = this.successfulQuestionId;

      cy.intercept(
        "POST",
        `/api/dashboard/*/dashcard/*/card/${failingQuestionId}/query`,
        {
          statusCode: 500,
          body: {
            cause: "some error",
            data: {},
            message: "some error",
          },
        },
      );

      updateDashboardCards({
        dashboard_id: dashboardId,
        cards: [
          {
            card_id: failingQuestionId,
          },
          {
            card_id: successfulQuestionId,
            col: 11,
          },
        ],
      });
      visitDashboard(dashboardId);
    });

    getDashboardCards()
      .eq(0)
      .findByText("There was a problem displaying this chart.");

    getDashboardCards().eq(1).findByText("18,760").should("be.visible");
  });
});

describe("issue 16559", () => {
  const dashboardDetails = {
    name: "16559 Dashboard",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createDashboard(dashboardDetails).then(
      ({ body: { id: dashboardId } }) => {
        visitDashboard(dashboardId);
      },
    );
  });

  it("should always show the most recent revision (metabase#16559)", () => {
    toggleDashboardInfoSidebar();

    cy.log("Dashboard creation");
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You created this.")
      .should("be.visible");

    cy.log("Edit dashboard");
    editDashboard();
    openQuestionsSidebar();
    sidebar().findByText("Orders, Count").click();
    cy.button("Save").click();
    toggleDashboardInfoSidebar();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You added a card.")
      .should("be.visible");

    cy.log("Change dashboard name");
    cy.findByTestId("dashboard-name-heading").click().type(" modified").blur();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText(
        'You renamed this Dashboard from "16559 Dashboard" to "16559 Dashboard modified".',
      )
      .should("be.visible");

    cy.log("Add description");
    cy.findByPlaceholderText("Add description")
      .click()
      .type("16559 description")
      .blur();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You added a description.")
      .should("be.visible");

    cy.log("Toggle auto-apply filters");
    rightSidebar().findByText("Auto-apply filters").click();
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You set auto apply filters to false.")
      .should("be.visible");

    cy.log("Move dashboard to another collection");
    dashboardHeader().icon("ellipsis").click();
    popover().findByText("Move").click();
    entityPickerModal().within(() => {
      cy.findByText("First collection").click();
      cy.button("Move").click();
    });
    cy.findByTestId("dashboard-history-list")
      .findAllByRole("listitem")
      .eq(0)
      .findByText("You moved this Dashboard to First collection.")
      .should("be.visible");
  });
});

describe("issue 17879", () => {
  function setupDashcardAndDrillToQuestion({
    sourceDateUnit,
    expectedFilterText,
    targetDateUnit = "default",
  }) {
    if (targetDateUnit === "default") {
      cy.createQuestion({
        name: "Q1 - 17879",
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
      });
    } else {
      cy.createQuestion({
        name: "Q1 - 17879",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": targetDateUnit }],
          ],
          limit: 5,
        },
      });
    }

    cy.createDashboardWithQuestions({
      dashboardName: "Dashboard with aggregated Q2",
      questions: [
        {
          name: "Q2",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": sourceDateUnit }],
            ],
            limit: 5,
          },
        },
      ],
    }).then(({ dashboard }) => {
      cy.intercept(
        "POST",
        `/api/dashboard/${dashboard.id}/dashcard/*/card/*/query`,
      ).as("getCardQuery");

      visitDashboard(dashboard.id);
      editDashboard(dashboard.id);

      showDashboardCardActions();
      cy.findByTestId("dashboardcard-actions-panel").icon("click").click();

      cy.findByText("Go to a custom destination").click();
      cy.findByText("Saved question").click();
      cy.findByText("Q1 - 17879").click();
      cy.findByText("Created At").click();

      popover().within(() => {
        cy.findByText("Created At").click();
      });

      cy.findByText("Done").click();

      saveDashboard();

      cy.wait("@getCardQuery");

      cy.findByTestId("visualization-root").within(() => {
        cartesianChartCircle().first().click({ force: true });
      });

      cy.url().should("include", "/question");

      cy.findByTestId("qb-filters-panel").should(
        "have.text",
        expectedFilterText,
      );
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should map dashcard date parameter to correct date range filter in target question - month -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "month",
      expectedFilterText: "Created At is Apr 1–30, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - week -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "week",
      expectedFilterText: "Created At is Apr 24–30, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - year -> day (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "year",
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2022",
    });
  });

  it("should map dashcard date parameter to correct date range filter in target question - year -> month (metabase#17879)", () => {
    setupDashcardAndDrillToQuestion({
      sourceDateUnit: "year",
      expectedFilterText: "Created At is Jan 1 – Dec 31, 2022",
      targetDateUnit: "month",
    });
  });
});

describe("issue 21830", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("slow loading card visualization options click shouldn't lead to error (metabase#21830)", () => {
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept(
      {
        method: "POST",
        url: "/api/dashboard/*/dashcard/*/card/*/query",
        middleware: true,
      },
      req => {
        req.on("response", res => {
          // throttle the response to simulate a mobile 3G connection
          res.setThrottle(100);
        });
      },
    ).as("getCardQuery");

    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);
    cy.wait("@getDashboard");

    // it's crucial that we try to click on this icon BEFORE we wait for the `getCardQuery` response!
    editDashboard();
    showDashboardCardActions();

    getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("not.exist");
      cy.icon("palette").should("not.exist");
    });

    cy.wait("@getCardQuery");

    getDashboardCard().within(() => {
      cy.icon("close").should("be.visible");
      cy.icon("click").should("be.visible");
      cy.icon("palette").should("be.visible");
    });
  });
});

describe("issue 28756", () => {
  const UNRESTRICTED_COLLECTION_NAME = "Unrestricted collection";
  const RESTRICTED_COLLECTION_NAME = "Restricted collection";

  const ADMIN_GROUP_ID = "2";

  const TOAST_TIMEOUT_SAFETY_MARGIN = 1000;
  const TOAST_TIMEOUT = DASHBOARD_SLOW_TIMEOUT + TOAST_TIMEOUT_SAFETY_MARGIN;
  const TOAST_MESSAGE =
    "Would you like to be notified when this dashboard is done loading?";

  function restrictCollectionForNonAdmins(collectionId) {
    cy.request("GET", "/api/collection/graph").then(
      ({ body: { revision, groups } }) => {
        cy.request("PUT", "/api/collection/graph", {
          revision,
          groups: _.mapObject(groups, (groupPermissions, groupId) => {
            const permission = groupId === ADMIN_GROUP_ID ? "write" : "none";
            return assoc(groupPermissions, collectionId, permission);
          }),
        });
      },
    );
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createCollection({ name: RESTRICTED_COLLECTION_NAME }).then(
      ({ body: restrictedCollection }) => {
        restrictCollectionForNonAdmins(restrictedCollection.id);

        cy.createCollection({ name: UNRESTRICTED_COLLECTION_NAME }).then(
          ({ body: unrestrictedCollection }) => {
            cy.createQuestionAndDashboard({
              dashboardDetails: {
                collection_id: unrestrictedCollection.id,
              },
              questionDetails: {
                name: "28756 Question",
                query: {
                  "source-table": PRODUCTS_ID,
                },
                collection_id: restrictedCollection.id,
              },
            }).then(({ body: { dashboard_id } }) => {
              cy.wrap(dashboard_id).as("dashboardId");
            });
          },
        );
      },
    );
  });

  it("should not show a toast to enable notifications to user with no permissions to see the card (metabase#28756)", () => {
    cy.signInAsNormalUser();
    cy.clock();

    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);
      cy.tick(TOAST_TIMEOUT);

      undoToast().should("not.exist");
      cy.findByText(TOAST_MESSAGE).should("not.exist");
    });
  });
});

describeEE("issue 29076", () => {
  beforeEach(() => {
    restore("default-ee");

    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as("cardQuery");

    cy.signInAsAdmin();
    setTokenFeatures("all");
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "blocked",
          "create-queries": "no",
        },
      },
      [COLLECTION_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "query-builder",
        },
      },
    });
    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", PRODUCTS.ID, null]],
      },
    });
    cy.signInAsSandboxedUser();
  });

  it("should be able to drilldown to a saved question in a dashboard with sandboxing (metabase#29076)", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    cy.wait("@cardQuery");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("be.visible");
  });
});

describe("issue 31274", () => {
  const createTextCards = length => {
    return Array.from({ length }).map((_, index) => {
      return getTextCardDetails({
        size_x: 2,
        size_y: 2,
        row: (length - index - 1) * 2,
        text: `Text card ${index + 1}`,
      });
    });
  };

  function visibleActionsPanel() {
    return cy.findAllByTestId("dashboardcard-actions-panel").filter(":visible");
  }

  function secondTextCard() {
    return cy.findAllByTestId("editing-dashboard-text-preview").eq(1).parent();
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // cypress automatically scrolls to the element, but we don't need it in this test
  it(
    "should not clip dashcard actions (metabase#31274)",
    { tags: "@flaky" },
    () => {
      cy.createDashboard().then(({ body: dashboard }) => {
        const dashcards = createTextCards(3);
        cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
          dashcards,
        });

        visitDashboard(dashboard.id);
        editDashboard(dashboard.id);

        secondTextCard().realHover();

        visibleActionsPanel().should("have.length", 1);

        cy.log(
          "Make sure cypress can click the element, which means it is not covered by another",
        );

        visibleActionsPanel().within(() => {
          cy.icon("close").click({
            position: "top",
          });
        });

        cy.findAllByTestId("dashcard").should("have.length", 2);
      });
    },
  );

  it("renders cross icon on the link card without clipping", () => {
    cy.createDashboard().then(({ body: dashboard }) => {
      visitDashboard(dashboard.id);
      editDashboard(dashboard.id);
    });

    cy.icon("link").click();
    cy.findByPlaceholderText("https://example.com").realHover();

    cy.log(
      "Make sure cypress can click the element, which means it is not covered by another",
    );

    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("close").click({ position: "bottom" });
    });

    cy.findByTestId("dashcard").should("not.exist");
  });
});

describe("issue 31697", () => {
  const segmentDetails = {
    name: "Orders segment",
    description: "All orders with a total under $100.",
    table_id: ORDERS_ID,
    definition: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      filter: ["<", ["field", ORDERS.TOTAL, null], 100],
    },
  };

  const getQuestionDetails = segment => ({
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      filter: ["segment", segment.id],
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  });

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    createSegment(segmentDetails).then(({ body: segment }) => {
      cy.createQuestion(getQuestionDetails(segment), { wrapId: true });
    });
    cy.intercept("GET", "/api/automagic-dashboards/**").as("xrayDashboard");
  });

  it("should allow x-rays for questions with segments (metabase#31697)", () => {
    cy.get("@questionId").then(visitQuestion);
    cartesianChartCircle().eq(0).click();
    popover().findByText("Automatic insights…").click();
    popover().findByText("X-ray").click();
    cy.wait("@xrayDashboard");

    cy.findByRole("main").within(() => {
      cy.findByText(/A closer look at number of Orders/).should("be.visible");
    });
  });
});

describe("issue 31766", () => {
  function saveUpdatedQuestion() {
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");

    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
  }

  function assertQuestionIsUpdatedWithoutError() {
    cy.wait("@updateQuestion");
    modal().should("not.exist");
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  it("should not corrupt dashboard data (metabase#31766)", () => {
    const questionDetails = {
      name: "Orders",
      query: { "source-table": ORDERS_ID, limit: 5 },
    };

    const dashboardDetails = { name: "Orders in a dashboard" };

    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
      cardDetails: { size_x: 16, size_y: 8 },
    }).then(({ body: { dashboard_id, question_id, id: dashcard_id } }) => {
      const textCard = getTextCardDetails({
        row: 0,
        size_x: 24,
        size_y: 1,
        text: "top",
      });
      const questionCard = {
        row: 2,
        size_x: 16,
        size_y: 6,
        id: dashcard_id,
        card_id: question_id,
      };

      updateDashboardCards({ dashboard_id, cards: [textCard, questionCard] });

      visitDashboard(dashboard_id);
      editDashboard(dashboard_id);
    });

    // update text card
    cy.findByTestId("editing-dashboard-text-preview").type(1);

    saveDashboard();

    // visit question
    cy.findAllByTestId("dashcard").eq(1).findByText("Orders").click();

    cy.log("Update viz settings");

    cy.findByTestId("view-footer")
      .findByRole("button", { name: "Visualization" })
      .click();
    cy.findByTestId("Detail-button").click();

    saveUpdatedQuestion();

    assertQuestionIsUpdatedWithoutError();
  });
});

describe("issue 34382", () => {
  const createDashboardWithCards = () => {
    const getParameterMapping = ({ card_id }, parameters) => ({
      parameter_mappings: parameters.map(parameter => ({
        card_id,
        parameter_id: parameter.id,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      })),
    });

    const questionDetails = {
      name: "Products",
      query: { "source-table": PRODUCTS_ID },
    };

    const questionDashcardDetails = {
      row: 0,
      col: 0,
      size_x: 8,
      size_y: 8,
      visualization_settings: {},
    };
    const filterDetails = {
      name: "Product Category",
      slug: "category",
      id: "96917421",
      type: "category",
    };

    const dashboardDetails = {
      name: "Products in a dashboard",
      auto_apply_filters: false,
      parameters: [filterDetails],
    };

    cy.createDashboard(dashboardDetails).then(
      ({ body: { id: dashboard_id } }) => {
        cy.createQuestion(questionDetails).then(
          ({ body: { id: question_id } }) => {
            cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
              dashcards: [
                {
                  id: -1,
                  card_id: question_id,
                  ...questionDashcardDetails,
                  ...getParameterMapping({ card_id: question_id }, [
                    filterDetails,
                  ]),
                },
              ],
            });
          },
        );

        cy.wrap(dashboard_id).as("dashboardId");
      },
    );
  };

  function addFilterValue(value) {
    filterWidget().click();
    popover().within(() => {
      cy.findByText(value).click();
      cy.findByRole("button", { name: "Add filter" }).click();
    });
  }

  function applyFilter() {
    dashboardParametersContainer()
      .findByRole("button", { name: "Apply" })
      .click();

    cy.wait("@dashcardQuery");
  }

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should preserve filter value when navigating between the dashboard and the query builder with auto-apply disabled (metabase#34382)", () => {
    createDashboardWithCards();
    visitDashboard("@dashboardId");

    addFilterValue("Gizmo");
    applyFilter();

    cy.log("Navigate to Products question");
    getDashboardCard().findByText("Products").click();

    cy.log("Navigate back to dashboard");
    queryBuilderHeader()
      .findByLabelText("Back to Products in a dashboard")
      .click();

    cy.location("search").should("eq", "?category=Gizmo");
    filterWidget().contains("Gizmo");

    getDashboardCard().within(() => {
      // only products with category "Gizmo" are filtered
      cy.findAllByTestId("table-row")
        .find("td")
        .eq(3)
        .should("contain", "Gizmo");
    });
  });
});

describe("should not redirect users to other pages when linking an entity (metabase#35037)", () => {
  const TEST_DASHBOARD_NAME = "Orders in a dashboard";
  const TEST_QUESTION_NAME = "Question#35037";

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/search?q=*").as("search");
    cy.intercept("GET", "/api/activity/recent_views").as("recentViews");
  });

  it("should not redirect users to recent item", () => {
    visitDashboard(ORDERS_DASHBOARD_ID);
    editDashboard();

    cy.url().then(url => {
      cy.wrap(url).as("originUrl");
    });

    cy.icon("link").click();
    cy.wait("@recentViews");

    cy.findByTestId("recents-list-container").within(() => {
      cy.findByText(TEST_DASHBOARD_NAME).click();
    });

    cy.url().then(currentURL => {
      cy.get("@originUrl").should("eq", currentURL);
    });

    cy.findByTestId("recents-list-container").should("not.exist");

    cy.findByTestId("entity-edit-display-link")
      .findByText(TEST_DASHBOARD_NAME)
      .should("exist");
  });

  it("should not redirect users to search item", () => {
    cy.createNativeQuestion({
      name: TEST_QUESTION_NAME,
      native: { query: "SELECT 1" },
    });
    visitDashboard(ORDERS_DASHBOARD_ID);
    editDashboard();

    cy.url().then(url => {
      cy.wrap(url).as("originUrl");
    });

    cy.icon("link").click();
    cy.findByTestId("custom-edit-text-link").type(TEST_QUESTION_NAME);
    cy.findByTestId("search-results-list").within(() => {
      cy.findByText(TEST_QUESTION_NAME).click();
    });

    cy.url().then(currentURL => {
      cy.get("@originUrl").should("eq", currentURL);
    });

    cy.findByTestId("search-results-list").should("not.exist");

    cy.findByTestId("entity-edit-display-link")
      .findByText(TEST_QUESTION_NAME)
      .should("exist");
  });
});

describe("issue 39863", () => {
  const TAB_1 = { id: 1, name: "Tab 1" };
  const TAB_2 = { id: 2, name: "Tab 2" };

  const DATE_FILTER = {
    id: "2",
    name: "Date filter",
    slug: "filter-date",
    type: "date/all-options",
  };

  const CREATED_AT_FIELD_REF = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime" },
  ];

  const COMMON_DASHCARD_INFO = {
    card_id: ORDERS_QUESTION_ID,
    parameter_mappings: [
      {
        parameter_id: DATE_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", CREATED_AT_FIELD_REF],
      },
    ],
    size_x: 10,
    size_y: 4,
  };

  const ID_FILTER = {
    id: "3",
    name: "ID filter",
    slug: "filter-id",
    type: "id",
  };

  const USER_ID_FILTER = {
    id: "4",
    name: "User ID filter",
    slug: "filter-user-id",
    type: "id",
  };

  const PRODUCT_ID_FILTER = {
    id: "5",
    name: "Product ID filter",
    slug: "filter-product-id",
    type: "id",
  };

  const SUBTOTAL_FILTER = {
    id: "6",
    name: "Subtotal filter",
    slug: "filter-subtotal",
    type: "number/<=",
  };

  const TOTAL_FILTER = {
    id: "7",
    name: "Total filter",
    slug: "filter-total",
    type: "number/<=",
  };

  const TAX_FILTER = {
    id: "8",
    name: "Tax filter",
    slug: "filter-tax",
    type: "number/<=",
  };

  const DISCOUNT_FILTER = {
    id: "9",
    name: "Discount filter",
    slug: "filter-discount",
    type: "number/<=",
  };

  const QUANTITY_FILTER = {
    id: "10",
    name: "Quantity filter",
    slug: "filter-quantity",
    type: "number/<=",
  };

  const ID_FIELD_REF = ["field", ORDERS.ID, { "base-type": "type/BigInteger" }];

  const USER_ID_FIELD_REF = [
    "field",
    ORDERS.USER_ID,
    { "base-type": "type/BigInteger" },
  ];

  const PRODUCT_ID_FIELD_REF = [
    "field",
    ORDERS.PRODUCT_ID,
    { "base-type": "type/BigInteger" },
  ];

  const SUBTOTAL_FIELD_REF = [
    "field",
    ORDERS.SUBTOTAL,
    { "base-type": "type/Float" },
  ];

  const TOTAL_FIELD_REF = [
    "field",
    ORDERS.TOTAL,
    { "base-type": "type/Float" },
  ];

  const TAX_FIELD_REF = ["field", ORDERS.TAX, { "base-type": "type/Float" }];

  const DISCOUNT_FIELD_REF = [
    "field",
    ORDERS.DISCOUNT,
    { "base-type": "type/Float" },
  ];

  const QUANTITY_FIELD_REF = [
    "field",
    ORDERS.QUANTITY,
    { "base-type": "type/Number" },
  ];

  const DASHCARD_WITH_9_FILTERS = {
    card_id: ORDERS_QUESTION_ID,
    parameter_mappings: [
      {
        parameter_id: DATE_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", CREATED_AT_FIELD_REF],
      },
      {
        parameter_id: ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", ID_FIELD_REF],
      },
      {
        parameter_id: USER_ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", USER_ID_FIELD_REF],
      },
      {
        parameter_id: PRODUCT_ID_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", PRODUCT_ID_FIELD_REF],
      },
      {
        parameter_id: SUBTOTAL_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", SUBTOTAL_FIELD_REF],
      },
      {
        parameter_id: TOTAL_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", TOTAL_FIELD_REF],
      },
      {
        parameter_id: TAX_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", TAX_FIELD_REF],
      },
      {
        parameter_id: DISCOUNT_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", DISCOUNT_FIELD_REF],
      },
      {
        parameter_id: QUANTITY_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", QUANTITY_FIELD_REF],
      },
    ],
    size_x: 10,
    size_y: 4,
  };

  function setDateFilter() {
    cy.findByLabelText("Date filter").click();
    popover()
      .findByText(/Last 12 months/i)
      .click();
  }

  function assertNoLoadingSpinners() {
    dashboardGrid().findAllByTestId("loading-spinner").should("have.length", 0);
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should not rerun queries when switching tabs and there are no parameter changes", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [DATE_FILTER],
      dashcards: [
        createMockDashboardCard({
          ...COMMON_DASHCARD_INFO,
          id: -1,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          ...COMMON_DASHCARD_INFO,
          id: -2,
          dashboard_tab_id: TAB_2.id,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));

    // Initial query for 1st tab
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 1);

    // Initial query for 2nd tab
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // Rerun 1st tab query with new parameters
    setDateFilter();
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 3);

    // Rerun 2nd tab query with new parameters
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    goToTab(TAB_2.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);
  });

  it("should not rerun queries just because there are 9 or more attached filters to a dash-card", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [
        DATE_FILTER,
        ID_FILTER,
        USER_ID_FILTER,
        PRODUCT_ID_FILTER,
        SUBTOTAL_FILTER,
        TOTAL_FILTER,
        TAX_FILTER,
        DISCOUNT_FILTER,
        QUANTITY_FILTER,
      ],
      dashcards: [
        createMockDashboardCard({
          ...DASHCARD_WITH_9_FILTERS,
          id: -1,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          ...DASHCARD_WITH_9_FILTERS,
          id: -2,
          dashboard_tab_id: TAB_2.id,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));

    // Initial query for 1st tab
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 1);

    // Initial query for 2nd tab
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 2);

    // Rerun 1st tab query with new parameters
    setDateFilter();
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 3);

    // Rerun 2nd tab query with new parameters
    goToTab(TAB_2.name);
    cy.wait("@dashcardQuery");
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);

    // No parameters change, no query rerun
    goToTab(TAB_1.name);
    goToTab(TAB_2.name);
    assertNoLoadingSpinners();
    cy.get("@dashcardQuery.all").should("have.length", 4);
  });
});

describe("issue 40695", () => {
  const TAB_1 = {
    id: 1,
    name: "Tab 1",
  };
  const TAB_2 = {
    id: 2,
    name: "Tab 2",
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not show dashcards from other tabs after entering and leaving editing mode", () => {
    createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          dashboard_tab_id: TAB_1.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_QUESTION_ID,
        }),
        createMockDashboardCard({
          id: -2,
          dashboard_tab_id: TAB_2.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_COUNT_QUESTION_ID,
        }),
      ],
    }).then(dashboard => visitDashboard(dashboard.id));

    editDashboard();
    cy.findByTestId("edit-bar").button("Cancel").click();

    dashboardGrid().within(() => {
      cy.findByText("Orders").should("exist");
      cy.findByText("Orders, Count").should("not.exist");
      getDashboardCards().should("have.length", 1);
    });
  });
});

describe("issue 42165", () => {
  const peopleSourceFieldRef = [
    "field",
    PEOPLE.SOURCE,
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ];
  const ordersCreatedAtFieldRef = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime", "temporal-unit": "month" },
  ];

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [
          createMockParameter({
            id: "param-1",
            name: "Date",
            slug: "date",
            type: "date/all-options",
          }),
        ],
      },
      questions: [
        {
          name: "fooBarQuestion",
          display: "bar",
          query: {
            aggregation: [["count"]],
            breakout: [peopleSourceFieldRef, ordersCreatedAtFieldRef],
            "source-table": ORDERS_ID,
          },
        },
      ],
    }).then(({ dashboard: _dashboard }) => {
      cy.request("GET", `/api/dashboard/${_dashboard.id}`).then(
        ({ body: dashboard }) => {
          const [dashcard] = dashboard.dashcards;
          const [parameter] = dashboard.parameters;
          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            dashcards: [
              {
                ...dashcard,
                parameter_mappings: [
                  {
                    card_id: dashcard.card_id,
                    parameter_id: parameter.id,
                    target: ["dimension", ordersCreatedAtFieldRef],
                  },
                ],
              },
            ],
          }).then(() => {
            cy.wrap(_dashboard.id).as("dashboardId");
          });
        },
      );
    });
  });

  it("should use card name instead of series names when navigating to QB from dashcard title", () => {
    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);

      filterWidget().click();
      popover().findByText("Last 30 Days").click();
      cy.wait("@dashcardQuery");

      getDashboardCard(0).findByText("fooBarQuestion").click();

      cy.wait("@dataset");
      cy.title().should("eq", "fooBarQuestion · Metabase");
    });
  });
});
