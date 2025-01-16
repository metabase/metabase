import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

import {
  setAdHocFilter,
  setQuarterAndYear,
} from "../native-filters/helpers/e2e-date-filter-helpers";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

describe("issue 8030 + 32444", () => {
  const filterDetails = {
    name: "ID Column",
    slug: "id",
    id: "11d79abe",
    type: "id",
    sectionId: "id",
  };

  const question1Details = {
    name: "Q1",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const question2Details = {
    name: "Q2",
    query: { "source-table": ORDERS_ID, limit: 2 },
  };

  const questionWithFilter = {
    name: "Question with Filter",
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      limit: 2,
      filter: [">", ["field", ORDERS.TOTAL, null], 100],
    },
  };

  const dashboardDetails = {
    name: "Filters",
    parameters: [filterDetails],
  };
  const createQuestionsAndDashboard = () => {
    return cy
      .createQuestion(question1Details)
      .then(({ body: { id: card1_id } }) => {
        return cy
          .createQuestion(question2Details)
          .then(({ body: { id: card2_id } }) => {
            return cy
              .createDashboard(dashboardDetails)
              .then(({ body: { id: dashboard_id } }) => {
                return { dashboard_id, card1_id, card2_id };
              });
          });
      });
  };

  const setFilterMapping = ({ dashboard_id, card1_id, card2_id }) => {
    return cy.updateDashboardCards({
      dashboard_id,
      cards: [
        {
          card_id: card1_id,
          row: 0,
          col: 0,
          size_x: 5,
          size_y: 4,
          parameter_mappings: [
            {
              parameter_id: filterDetails.id,
              card_id: card1_id,
              target: ["dimension", ["field", PRODUCTS.ID, null]],
            },
          ],
        },
        {
          card_id: card2_id,
          row: 0,
          col: 4,
          size_x: 5,
          size_y: 4,
          parameter_mappings: [
            {
              parameter_id: filterDetails.id,
              card_id: card1_id,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
        },
      ].filter(Boolean),
    });
  };

  const interceptRequests = ({ dashboard_id, card1_id, card2_id }) => {
    cy.intercept("GET", `/api/dashboard/${dashboard_id}*`).as("getDashboard");
    cy.intercept(
      "POST",
      `/api/dashboard/${dashboard_id}/dashcard/*/card/${card1_id}/query`,
    ).as("getCardQuery1");
    cy.intercept(
      "POST",
      `/api/dashboard/${dashboard_id}/dashcard/*/card/${card2_id}/query`,
    ).as("getCardQuery2");
  };

  const addFilterValue = value => {
    cy.filterWidget().click();
    cy.findByText(value).click();
    cy.button("Add filter").click();
  };

  describe("issue 8030", () => {
    beforeEach(() => {
      cy.restore();
      cy.signInAsAdmin();
    });

    it("should not reload dashboard cards not connected to a filter (metabase#8030)", () => {
      createQuestionsAndDashboard().then(
        ({ dashboard_id, card1_id, card2_id }) => {
          interceptRequests({ dashboard_id, card1_id, card2_id });
          setFilterMapping({ dashboard_id, card1_id, card2_id }).then(() => {
            cy.visit(`/dashboard/${dashboard_id}`);
            cy.wait("@getDashboard");
            cy.wait("@getCardQuery1");
            cy.wait("@getCardQuery2");

            cy.findByText(filterDetails.name).click();
            cy.popover().within(() => {
              // the filter is connected only to the first card
              cy.findByPlaceholderText("Enter an ID").type("1");
              cy.button("Add filter").click();
            });
            cy.wait("@getCardQuery1");
            cy.get("@getCardQuery1.all").should("have.length", 2);
            cy.get("@getCardQuery2.all").should("have.length", 1);
          });
        },
      );
    });
  });

  describe("issue 32444", () => {
    beforeEach(() => {
      cy.restore();
      cy.signInAsAdmin();
    });

    it("should not reload dashboard cards not connected to a filter (metabase#32444)", () => {
      cy.createDashboardWithQuestions({
        questions: [question1Details, questionWithFilter],
      }).then(({ dashboard }) => {
        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard.id}/dashcard/*/card/*/query`,
        ).as("getCardQuery");

        cy.visitDashboard(dashboard.id);
        cy.editDashboard(dashboard.id);

        cy.get("@getCardQuery.all").should("have.length", 2);

        cy.setFilter("Text or Category", "Is");
        cy.selectDashboardFilter(
          cy.findAllByTestId("dashcard").first(),
          "Title",
        );

        cy.undoToast().findByRole("button", { name: "Auto-connect" }).click();

        cy.findAllByTestId("dashcard")
          .eq(1)
          .findByLabelText("Disconnect")
          .click();

        cy.saveDashboard();

        cy.wait("@getCardQuery");
        cy.get("@getCardQuery.all").should("have.length", 4);

        addFilterValue("Aerodynamic Bronze Hat");

        cy.wait("@getCardQuery");
        cy.get("@getCardQuery.all").should("have.length", 5);
      });
    });
  });
});

describe("issue 12720, issue 47172", () => {
  function clickThrough(title) {
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findAllByTestId("dashcard-container").contains(title).click();

    cy.location("search").should("contain", dashboardFilter.default);
    cy.filterWidget().contains("After January 1, 2026");
  }
  // After January 1st, 2026
  const dashboardFilter = {
    default: "2026-01-01~",
    id: "d3b78b27",
    name: "Date Filter",
    slug: "date_filter",
    type: "date/all-options",
  };

  const questionDetails = {
    name: "12720_SQL",
    native: {
      query: "SELECT * FROM ORDERS WHERE {{filter}}",
      "template-tags": {
        filter: {
          id: "1d006bb7-045f-6c57-e41b-2661a7648276",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", ORDERS.CREATED_AT, null],
          "widget-type": "date/all-options",
          default: null,
        },
      },
    },
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    // In this test we're using already present question ("Orders") and the dashboard with that question ("Orders in a dashboard")
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [dashboardFilter],
    });

    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: SQL_ID } }) => {
        cy.updateDashboardCards({
          dashboard_id: ORDERS_DASHBOARD_ID,
          cards: [
            {
              card_id: SQL_ID,
              row: 0,
              col: 8, // making sure it doesn't overlap the existing card
              size_x: 7,
              size_y: 5,
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id: SQL_ID,
                  target: ["dimension", ["template-tag", "filter"]],
                },
              ],
            },
            // add filter to existing card
            {
              id: ORDERS_DASHBOARD_DASHCARD_ID,
              card_id: ORDERS_QUESTION_ID,
              row: 0,
              col: 0,
              size_x: 7,
              size_y: 5,
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id: ORDERS_QUESTION_ID,
                  target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
                },
              ],
            },
          ],
        });
      },
    );
  });

  it("should show QB question on a dashboard with filter connected to card without data-permission (metabase#12720)", () => {
    cy.signIn("readonly");

    clickThrough("12720_SQL");
    clickThrough("Orders");
  });

  it("should apply the specific (before|after) filter on a native question with field filter (metabase#47172)", () => {
    cy.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.getDashboardCard(1).within(() => {
      cy.findByTestId("TableFooter").should("exist");
      cy.findByText("There was a problem displaying this chart.").should(
        "not.exist",
      );

      cy.log("Drill down to the question");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.findByText(questionDetails.name).click();
    });

    cy.location("search").should("eq", `?filter=${dashboardFilter.default}`);
    cy.wait("@cardQuery");
    cy.tableInteractive().should("be.visible").and("contain", "97.44");
    cy.findByTestId("question-row-count").should(
      "not.have.text",
      "Showing 0 rows",
    );
    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 1,980 rows",
    );
  });
});

describe("issue 12985 > dashboard filter dropdown/search", () => {
  const categoryFilter = {
    name: "Category",
    slug: "category",
    id: "2a12e66c",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [categoryFilter] };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should work for saved nested questions (metabase#12985-1)", () => {
    cy.createQuestion({
      name: "Q1",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: Q1_ID } }) => {
      // Create nested card based on the first one
      const nestedQuestion = {
        name: "Q2",
        query: { "source-table": `card__${Q1_ID}` },
      };

      cy.createQuestionAndDashboard({
        questionDetails: nestedQuestion,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.log("Connect dashboard filters to the nested card");

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 13,
              size_y: 8,
              series: [],
              visualization_settings: {},
              // Connect filter to the card
              parameter_mappings: [
                {
                  parameter_id: categoryFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        });

        cy.visitDashboard(dashboard_id);
      });
    });

    cy.filterWidget().contains("Category").click();
    cy.log("Failing to show dropdown in v0.36.0 through v.0.37.0");

    cy.popover().within(() => {
      cy.findByText("Doohickey");
      cy.findByText("Gizmo");
      cy.findByText("Widget");
      cy.findByText("Gadget").click();
    });
    cy.button("Add filter").click();

    cy.location("search").should("eq", "?category=Gadget");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ergonomic Silk Coat");
  });

  it.skip("should work for aggregated questions (metabase#12985-2)", () => {
    const questionDetails = {
      name: "12985-v2",
      query: {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
        filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1],
      },
    };

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.log("Connect dashboard filter to the aggregated card");

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              series: [],
              visualization_settings: {},
              // Connect filter to the card
              parameter_mappings: [
                {
                  parameter_id: categoryFilter.id,
                  card_id,
                  target: [
                    "dimension",
                    ["field", "CATEGORY", { "base-type": "type/Text" }],
                  ],
                },
              ],
            },
          ],
        });

        cy.visitDashboard(dashboard_id);
      },
    );

    cy.filterWidget().contains("Category").click();
    // It will fail at this point until the issue is fixed because popover never appears
    cy.popover().contains("Gadget").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filter").click();
    cy.url().should("contain", "?category=Gadget");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ergonomic Silk Coat");
  });
});

describe("issues 15119 and 16112", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${REVIEWS.REVIEWER}`, {
      has_field_values: "list",
      semantic_type: "type/Category",
    });

    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      has_field_values: "list",
      semantic_type: "type/Category",
    });
  });

  it("user without data permissions should be able to use dashboard filters (metabase#15119, metabase#16112)", () => {
    const questionDetails = {
      name: "15119",
      query: { "source-table": REVIEWS_ID },
    };

    const ratingFilter = {
      name: "Rating Filter",
      slug: "rating",
      id: "5dfco74e",
      type: "string/=",
      sectionId: "string",
    };

    const reviewerFilter = {
      name: "Reviewer Filter",
      slug: "reviewer",
      id: "ad1c877e",
      type: "string/=",
      sectionId: "string",
    };

    const dashboardDetails = { parameters: [reviewerFilter, ratingFilter] };

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Connect filters to the card
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 9,
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: ratingFilter.id,
                  card_id,
                  target: ["dimension", ["field", REVIEWS.RATING, null]],
                },
                {
                  parameter_id: reviewerFilter.id,
                  card_id,
                  target: ["dimension", ["field", REVIEWS.REVIEWER, null]],
                },
              ],
            },
          ],
        });

        // Actually need to setup the linked filter:
        cy.visitDashboard(dashboard_id);
        cy.editDashboard();
        cy.findByText("Rating Filter").click();
        cy.findByText("Linked filters").click();

        // turn on the toggle
        cy.sidebar().findByRole("switch").parent().get("label").click();

        cy.findByText("Save").click();

        cy.signIn("nodata");
        cy.visitDashboard(dashboard_id);
      },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(reviewerFilter.name).click();
    cy.popover().contains("adam").click();
    cy.button("Add filter").click();

    cy.findByTestId("dashcard-container").should("contain", "adam");
    cy.location("search").should("eq", "?rating=&reviewer=adam");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ratingFilter.name).click();

    cy.popover().contains("5").click();
    cy.button("Add filter").click();

    cy.findByTestId("dashcard-container").should("contain", "adam");
    cy.findByTestId("dashcard-container").should("contain", "5");
    cy.location("search").should("eq", "?rating=5&reviewer=adam");
  });
});

describe("issue 16663", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
    },
  };

  const FILTER = {
    name: "Quarter and Year",
    slug: "quarter_and_year",
    id: "f8ae0c97",
    type: "date/quarter-year",
    sectionId: "date",
    default: "Q1-2023",
  };

  const dashboardDetails = { parameters: [FILTER] };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should remove filter value from url after going to another dashboard (metabase#16663)", () => {
    const dashboardToRedirect = "Orders in a dashboard";
    const queryParam = "quarter_and_year=Q1";

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        cy.addOrUpdateDashboardCard({
          dashboard_id: dashboardCard.dashboard_id,
          card_id: dashboardCard.card_id,
          card: {
            parameter_mappings: [
              {
                parameter_id: FILTER.id,
                card_id: dashboardCard.card_id,
                target: [
                  "dimension",
                  [
                    "field",
                    ORDERS.CREATED_AT,
                    {
                      "base-type": "type/DateTime",
                    },
                  ],
                ],
              },
            ],
          },
        });
        cy.visitDashboard(dashboard_id);
      },
    );

    cy.url().should("include", queryParam);

    cy.commandPaletteSearch(dashboardToRedirect, false);
    cy.commandPalette().within(() => {
      cy.findByRole("option", { name: dashboardToRedirect }).click();
    });

    cy.url().should("include", "orders-in-a-dashboard");
    cy.url().should("not.include", queryParam);
  });
});

describe("issue 17211", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
    },
  };

  const filter = {
    name: "Location",
    slug: "location",
    id: "96917420",
    type: "string/=",
    sectionId: "location",
  };

  const dashboardDetails = {
    parameters: [filter],
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PEOPLE.CITY,
                      {
                        "source-field": ORDERS.USER_ID,
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        });

        cy.visitDashboard(dashboard_id);
      },
    );
  });

  it("should not falsely alert that no matching dashboard filter has been found (metabase#17211)", () => {
    cy.filterWidget().click();

    cy.findByPlaceholderText("Search by City").type("abb");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Abbeville").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("No matching City found").should("not.exist");
  });
});

describe("issue 17551", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion({
      native: {
        query:
          "select 'yesterday' as \"text\", dateadd('day', -1, current_date::date) as \"date\" union all\nselect 'today', current_date::date union all\nselect 'tomorrow', dateadd('day', 1, current_date::date)\n",
      },
    }).then(({ body: { id: baseQuestionId } }) => {
      const questionDetails = {
        name: "17551 QB",
        query: { "source-table": `card__${baseQuestionId}` },
      };

      const filter = {
        name: "Date Filter",
        slug: "date_filter",
        id: "888188ad",
        type: "date/all-options",
        sectionId: "date",
      };

      const dashboardDetails = { parameters: [filter] };

      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        const mapFilterToCard = {
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id,
              target: [
                "dimension",
                [
                  "field",
                  "date",
                  {
                    "base-type": "type/DateTime",
                  },
                ],
              ],
            },
          ],
        };

        cy.editDashboardCard(card, mapFilterToCard);

        cy.visitDashboard(dashboard_id);
      });
    });
  });

  it("should include today in the 'All time' date filter when chosen 'Next' (metabase#17551)", () => {
    cy.filterWidget().click();
    setAdHocFilter({ condition: "Next", includeCurrent: true });

    cy.url().should("include", "?date_filter=next30days~");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("tomorrow");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("today");
  });
});

describe("issue 17775", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        "CC Date": [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime" },
        ],
      },
      "order-by": [
        ["asc", ["field", ORDERS.ID, { "base-type": "type/BigInteger" }]],
      ],
    },
  };

  const parameters = [
    {
      name: "Quarter and Year",
      slug: "quarter_and_year",
      id: "f8ae0c97",
      type: "date/quarter-year",
      sectionId: "date",
    },
  ];

  const dashboardDetails = { parameters };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        const updatedSize = { size_x: 21, size_y: 8 };

        cy.editDashboardCard(dashboardCard, updatedSize);

        cy.visitDashboard(dashboard_id);
      },
    );

    cy.editDashboard();

    // Make sure filter can be connected to the custom column using UI, rather than using API.
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .find(".Icon-gear")
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Column to filter on")
      .parent()
      .parent()
      .within(() => {
        cy.findByText("Select…").click();
      });

    cy.popover().within(() => {
      cy.findByText("CC Date").click();
    });

    cy.saveDashboard();
  });

  it("should be able to apply dashboard filter to a custom column (metabase#17775)", () => {
    cy.filterWidget().click();

    setQuarterAndYear({ quarter: "Q1", year: "2023" });

    cy.findAllByText("44.43").should("have.length", 2);
    cy.findAllByText("March 26, 2023, 8:45 AM").should("have.length", 2);
  });
});

describe("issue 19494", () => {
  const filter1 = {
    name: "Card 1 Filter",
    slug: "card1_filter",
    id: "ab6f631",
    type: "string/=",
    sectionId: "string",
  };

  const filter2 = {
    name: "Card 2 Filter",
    slug: "card2_filter",
    id: "a9801ade",
    type: "string/=",
    sectionId: "string",
  };
  function connectFilterToCard({ filterName, cardPosition }) {
    cy.findByText(filterName).find(".Icon-gear").click();

    cy.findAllByText("Select…").eq(cardPosition).click();

    cy.popover().contains("Category").click();
  }

  function setDefaultFilter(value) {
    cy.findByText("No default").click();

    cy.popover().contains(value).click();

    cy.button("Add filter").click();
  }

  function checkAppliedFilter(name, value) {
    cy.findByText(name).closest("fieldset").contains(value);
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    // Add two "Orders" questions to the existing "Orders in a dashboard" dashboard
    cy.updateDashboardCards({
      dashboard_id: ORDERS_DASHBOARD_ID,
      cards: [
        {
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 8,
        },
        {
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 8,
          size_x: 11,
          size_y: 8,
        },
      ],
    });

    // Add two dashboard filters (not yet connected to any of the cards)
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [filter1, filter2],
    });
  });

  it("should correctly apply different filters with default values to all cards of the same question (metabase#19494)", () => {
    // Instead of using the API to connect filters to the cards,
    // let's use UI to replicate user experience as closely as possible
    cy.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.editDashboard();

    connectFilterToCard({ filterName: "Card 1 Filter", cardPosition: 0 });
    setDefaultFilter("Doohickey");

    connectFilterToCard({ filterName: "Card 2 Filter", cardPosition: -1 });
    setDefaultFilter("Gizmo");

    cy.saveDashboard();

    checkAppliedFilter("Card 1 Filter", "Doohickey");

    cy.getDashboardCard(0).should("contain", "148.23");

    checkAppliedFilter("Card 2 Filter", "Gizmo");

    cy.getDashboardCard(1).should("contain", "110.93");
  });
});

describe("issue 16177", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      semantic_type: null,
    });
  });

  it("should not lose the default value of the parameter connected to a field with a coercion strategy applied (metabase#16177)", () => {
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.editDashboard();
    cy.setFilter("Date picker", "All Options");
    cy.selectDashboardFilter(cy.getDashboardCard(), "Quantity");
    cy.dashboardParameterSidebar().findByText("No default").click();
    cy.popover().findByText("Yesterday").click();
    cy.saveDashboard();
    cy.filterWidget().findByText("Yesterday").should("be.visible");
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.filterWidget().findByText("Yesterday").should("be.visible");
  });
});

describe("issue 20656", () => {
  const filter = {
    name: "ID",
    slug: "id",
    id: "11d79abe",
    type: "id",
    sectionId: "id",
  };

  const questionDetails = {
    query: { "source-table": PRODUCTS_ID, limit: 2 },
    // Admin's personal collection is always the first one (hence, the id 1)
    collection_id: ADMIN_PERSONAL_COLLECTION_ID,
  };

  const dashboardDetails = {
    parameters: [filter],
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should allow a user to visit a dashboard even without a permission to see the dashboard card (metabase#20656, metabase#24536)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.ID, null]],
                },
              ],
            },
          ],
        });

        cy.signInAsNormalUser();

        cy.visitDashboard(dashboard_id);
      },
    );

    // Make sure the filter widget is there
    cy.filterWidget();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don't have permission to see this card.");

    // Trying to edit the filter should not show mapping fields and shouldn't break frontend (metabase#24536)
    cy.editDashboard();

    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .find(".Icon-gear")
      .click();

    cy.getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.icon("key");
    });
  });
});

describe("issue 21528", () => {
  const NATIVE_QUESTION_DETAILS = {
    name: "Orders with Product ID filter",
    native: {
      query: "select * from ORDERS where {{product_id}}",
      "template-tags": {
        product_id: {
          type: "dimension",
          name: "product_id",
          id: "56708d23-6f01-42b7-98ed-f930295d31b9",
          "display-name": "Product ID",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
          "widget-type": "id",
        },
      },
    },
    parameters: [
      {
        id: "56708d23-6f01-42b7-98ed-f930295d31b9",
        type: "id",
        target: ["dimension", ["template-tag", "product_id"]],
        name: "Product ID",
        slug: "product_id",
      },
    ],
  };

  const DASHBOARD_DETAILS = {
    name: "Dashboard with ID filter",
    parameters: [
      {
        id: "9f85cd3d",
        name: "Product ID",
        sectionId: "id",
        slug: "product_id",
        type: "id",
      },
    ],
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(NATIVE_QUESTION_DETAILS, {
      wrapId: true,
      idAlias: "questionId",
    });

    cy.log(
      "set Orders.Product_ID `Filtering on this field`: `A list of all values`",
    );
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });

    cy.log("set Orders.Product_ID `Display values`: `Use foreign key > Title`");
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      type: "external",
      name: "Product ID",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.createDashboard(DASHBOARD_DETAILS).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      cy.addOrUpdateDashboardCard({
        card_id: this.questionId,
        dashboard_id: this.dashboardId,
        card: {
          parameter_mappings: [
            {
              card_id: this.questionId,
              parameter_id: "9f85cd3d",
              target: ["dimension", ["template-tag", "product_id"]],
            },
          ],
        },
      });
    });
  });

  it("should show dashboard ID filter values when mapped to a native question with a foreign key field filter", () => {
    cy.get("@questionId").then(questionId => {
      cy.visit(`/question/${questionId}`);
    });

    cy.findByTestId("native-query-top-bar").findByText("Product ID").click();
    cy.popover().contains("Rustic Paper Wallet - 1").should("be.visible");

    // Navigating to another page via JavaScript is faster than using `cy.visit("/dashboard/:dashboard-id")` to load the whole page again.
    cy.openNavigationSidebar();
    cy.navigationSidebar().findByText("Our analytics").click();
    cy.findByRole("main").findByText(DASHBOARD_DETAILS.name).click();

    cy.dashboardParametersContainer().findByText("Product ID").click();
    cy.popover().contains("Aerodynamic Bronze Hat - 144").should("be.visible");

    cy.log("The following scenario breaks on 46");
    // Navigating to another page via JavaScript is faster than using `cy.visit("/admin/datamodel")` to load the whole page again.
    cy.appBar().icon("gear").click();
    cy.popover().findByText("Admin settings").click();
    cy.appBar().findByText("Table Metadata").click();
    cy.findByRole("main")
      .findByText(
        "Select any table to see its schema and add or edit metadata.",
      )
      .should("be.visible");
    cy.findByRole("navigation").findByText("Exit admin").click();

    cy.openNavigationSidebar();
    cy.navigationSidebar().findByText("Our analytics").click();
    cy.findByRole("main").findByText(DASHBOARD_DETAILS.name).click();

    // Assert that the dashboard ID filter values is still showing correctly again.
    cy.dashboardParametersContainer().findByText("Product ID").click();
    cy.popover().contains("Aerodynamic Bronze Hat - 144").should("be.visible");
  });
});

describe("issue 22482", () => {
  function getFormattedRange(start, end) {
    return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.editDashboard();
    cy.setFilter("Date picker", "All Options");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    cy.popover().contains("Created At").eq(0).click();

    cy.saveDashboard();

    cy.filterWidget().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Relative dates…").click();
  });

  it("should round relative date range (metabase#22482)", () => {
    cy.findByLabelText("Interval").clear().type(15);
    cy.findByLabelText("Unit").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("months").click();

    const expectedRange = getFormattedRange(
      moment().startOf("month").add(-15, "month"),
      moment().add(-1, "month").endOf("month"),
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(expectedRange);
  });
});

describe("issue 22788", () => {
  const ccName = "Custom Category";
  const ccDisplayName = "Products.Custom Category";

  const questionDetails = {
    name: "22788",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: { [ccName]: ["field", PRODUCTS.CATEGORY, null] },
      limit: 5,
    },
  };

  const filter = {
    name: "Text",
    slug: "text",
    id: "a7565817",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    name: "22788D",
    parameters: [filter],
  };

  function addFilterAndAssert() {
    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Gizmo");
      cy.button("Add filter").click();
    });

    cy.findAllByText("Gizmo");
    cy.findAllByText("Doohickey").should("not.exist");
  }

  function openFilterSettings() {
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .find(".Icon-gear")
      .click();
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { dashboard_id, card_id, id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 11,
              size_y: 6,
              parameter_mappings: [
                {
                  parameter_id: filter.id,
                  card_id,
                  target: ["dimension", ["expression", ccName, null]],
                },
              ],
            },
          ],
        });

        cy.visitDashboard(dashboard_id);
      },
    );
  });

  it("should not drop filter connected to a custom column on a second dashboard edit (metabase#22788)", () => {
    addFilterAndAssert();

    cy.editDashboard();

    openFilterSettings();

    // Make sure the filter is still connected to the custom column

    cy.getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.findByText(ccDisplayName);
    });

    // need to actually change the dashboard to test a real save
    cy.sidebar().within(() => {
      cy.findByDisplayValue("Text").clear().type("my filter text");
      cy.button("Done").click();
    });

    cy.saveDashboard();

    cy.findAllByText("Gizmo");
    cy.findAllByText("Doohickey").should("not.exist");
  });
});

describe("issue 24235", () => {
  const questionDetails = {
    query: { "source-table": PRODUCTS_ID, limit: 5 },
  };

  const parameter = {
    id: "727b06c1",
    name: "Date Filter",
    sectionId: "date",
    slug: "date_filter",
    type: "date/all-options",
  };

  const parameterTarget = [
    "dimension",
    ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
  ];

  const dashboardDetails = { parameters: [parameter] };

  const mapParameterToDashboardCard = ({ id, card_id, dashboard_id }) => {
    cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
      dashcards: [
        {
          id,
          card_id,
          row: 0,
          col: 0,
          size_x: 24,
          size_y: 10,
          parameter_mappings: [
            {
              card_id,
              parameter_id: parameter.id,
              target: parameterTarget,
            },
          ],
        },
      ],
    });
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/**/query").as("getCardQuery");
  });

  it("should not allow to add a filter when all exclude options are selected (metabase#24235)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        mapParameterToDashboardCard({ id, card_id, dashboard_id });
        cy.visitDashboard(dashboard_id);
      },
    );

    cy.filterWidget().contains(parameter.name).click();
    cy.popover().within(() => {
      cy.findByText("Exclude…").click();
      cy.findByText("Days of the week…").click();
      cy.findByText("Select all").click();
      cy.findByText("Add filter").click();
    });

    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText("Select none").click();
      cy.button("Update filter").should("be.disabled");
    });
  });
});

describe("issues 15279 and 24500", () => {
  const listFilter = {
    name: "List",
    slug: "list",
    id: "6fe14171",
    type: "string/=",
    sectionId: "string",
  };

  const searchFilter = {
    name: "Search",
    slug: "search",
    id: "4db4913a",
    type: "string/=",
    sectionId: "string",
  };

  // Back when this issue was originally reported (around v47),
  // it was enough to have a filter without `name` and `slug` in order to corrupt it.
  // It seems that the backend validation is missing today or it's more relaxed.
  // We're adding invalid `type` and `sectionId` to make sure the filter is still considered corrupted.
  const corruptedFilter = {
    name: "",
    slug: "",
    id: "af72ce9c",
    type: "foo",
    sectionId: "bar",
  };

  const parameters = [listFilter, searchFilter, corruptedFilter];

  const questionDetails = {
    name: "15279",
    query: { "source-table": PEOPLE_ID, limit: 2 },
  };

  const dashboardDetails = { parameters };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("corrupted dashboard filter should still appear in the UI without breaking other filters (metabase#15279, metabase#24500)", () => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        // Connect filters to the question
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: listFilter.id,
                  card_id,
                  target: ["dimension", ["field", PEOPLE.SOURCE, null]],
                },
                {
                  parameter_id: searchFilter.id,
                  card_id,
                  target: ["dimension", ["field", PEOPLE.NAME, null]],
                },
              ],
            },
          ],
        });

        cy.visitDashboard(dashboard_id);
      },
    );

    cy.log("Make sure the list filter works");
    cy.filterWidget().contains("List").click();

    cy.popover().within(() => {
      cy.findByTextEnsureVisible("Organic").click();
      cy.findByTestId("Organic-filter-value").should("be.checked");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("contain", "Dagmar Fay");

    cy.log("Make sure the search filter works");
    cy.filterWidget().contains("Search").click();
    cy.popover().within(() => {
      cy.findByPlaceholderText("Search by Name").type("Lora Cronin");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("not.contain", "Dagmar Fay");

    cy.log("Make sure corrupted filter cannot connect to any field");
    // The corrupted filter is only visible when editing the dashboard
    cy.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("unnamed")
      .icon("gear")
      .click();
    cy.findByTestId("parameter-mapper-container").should(
      "contain",
      "No valid fields",
    );

    cy.log("Remove corrupted filter");
    cy.findByTestId("dashboard-parameter-sidebar").button("Remove").click();

    cy.log("Make sure UI updated before we save the dashboard");
    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("not.contain", "Dagmar Fay");

    cy.saveDashboard();

    cy.log("Make sure the list filter still works");
    cy.filterWidget().contains("Organic").click();
    cy.popover().findByTestId("Organic-filter-value").should("be.checked");

    cy.log("Make sure the search filter still works");
    // reset filter value
    cy.filterWidget().contains("Search").parent().icon("close").click();
    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("contain", "Dagmar Fay");

    cy.filterWidget().contains("Search").click();
    cy.popover().within(() => {
      cy.findByPlaceholderText("Search by Name").type("Lora Cronin");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("not.contain", "Dagmar Fay");
  });
});

describe("issue 25322", () => {
  const parameterDetails = {
    name: "Location",
    slug: "location",
    id: "f8ec7c71",
    type: "string/=",
    sectionId: "location",
  };

  const questionDetails = {
    name: "People",
    query: { "source-table": PEOPLE_ID },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  const createDashboard = () => {
    return cy
      .createQuestion(questionDetails)
      .then(({ body: { id: card_id } }) => {
        cy.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboard_id } }) => {
            cy.addOrUpdateDashboardCard({
              dashboard_id,
              card_id,
              card: {
                parameter_mappings: [
                  {
                    card_id,
                    parameter_id: parameterDetails.id,
                    target: ["dimension", ["field", PEOPLE.STATE, null]],
                  },
                ],
              },
            }).then(() => ({ dashboard_id }));
          },
        );
      });
  };

  const throttleFieldValuesRequest = dashboard_id => {
    const matcher = {
      method: "GET",
      url: `/api/dashboard/${dashboard_id}/params/${parameterDetails.id}/values`,
      middleware: true,
    };

    cy.intercept(matcher, req => req.on("response", res => res.setDelay(100)));
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should show a loader when loading field values (metabase#25322)", () => {
    createDashboard().then(({ dashboard_id }) => {
      cy.visitDashboard(dashboard_id);
      throttleFieldValuesRequest(dashboard_id);
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameterDetails.name).click();
    cy.popover().findByTestId("loading-indicator").should("exist");
  });
});

describe("issue 25248", () => {
  const question1Details = {
    name: "Q1",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["count"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  const question2Details = {
    name: "Q2",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    visualization_settings: {
      "graph.metrics": ["avg"],
      "graph.dimensions": ["CREATED_AT"],
    },
  };

  const parameterDetails = {
    name: "Date Filter",
    slug: "date_filter",
    id: "888188ad",
    type: "date/all-options",
    sectionId: "date",
  };

  const dashboardDetails = {
    name: "25248",
    parameters: [parameterDetails],
  };

  const createDashboard = () => {
    cy.createQuestionAndDashboard({
      questionDetails: question1Details,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.createQuestion(question2Details).then(
        ({ body: { id: card_2_id } }) => {
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [
              {
                id,
                card_id,
                series: [{ id: card_2_id }],
                row: 0,
                col: 0,
                size_x: 16,
                size_y: 8,
              },
            ],
          });
        },
      );
      cy.visitDashboard(dashboard_id);
    });
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping parameters to combined cards individually (metabase#25248)", () => {
    createDashboard();
    cy.editDashboard();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameterDetails.name).click();
    cy.findAllByText("Select…").first().click();
    cy.popover().findAllByText("Created At").first().click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders.Created At").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").should("be.visible");
  });
});

describe("issue 25374", () => {
  const questionDetails = {
    name: "25374",
    native: {
      "template-tags": {
        num: {
          id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
          name: "num",
          "display-name": "Num",
          type: "number",
          default: null,
        },
      },
      query: "select count(*) from orders where id in ({{num}})",
    },
    parameters: [
      {
        id: "f7672b4d-1e84-1fa8-bf02-b5e584cd4535",
        type: "number/=",
        target: ["variable", ["template-tag", "num"]],
        name: "Num",
        slug: "num",
        default: null,
      },
    ],
  };

  const filterDetails = {
    name: "Equal to",
    slug: "equal_to",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    name: "25374D",
    parameters: [filterDetails],
  };

  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card//*/query").as(
      "dashcardQuery",
    );

    cy.restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      // Connect filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 11,
            size_y: 6,
            parameter_mappings: [
              {
                parameter_id: filterDetails.id,
                card_id,
                target: ["variable", ["template-tag", "num"]],
              },
            ],
          },
        ],
      });

      cy.visitDashboard(dashboard_id);
      cy.wait("@dashcardQuery");
      cy.location("search").should("eq", "?equal_to=");

      cy.filterWidget().type("1,2,3{enter}");
      cy.wait("@dashcardQuery");

      cy.get(".CardVisualization")
        .should("contain", "COUNT(*)")
        .and("contain", "3");
      cy.findByDisplayValue("1,2,3").should("be.visible");

      cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    });
  });

  it("should pass comma-separated values down to the connected question (metabase#25374-1)", () => {
    // Drill-through and go to the question
    cy.getDashboardCard(0).findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    cy.get("[data-testid=cell-data]")
      .should("contain", "COUNT(*)")
      .and("contain", "3");

    cy.location("search").should("eq", "?num=1%2C2%2C3");
  });

  it("should retain comma-separated values on refresh (metabase#25374-2)", () => {
    cy.reload();

    // Make sure filter widget still has all the values
    cy.findByDisplayValue("1,2,3");

    // Make sure the result in the card is correct
    cy.get(".CardVisualization")
      .should("contain", "COUNT(*)")
      .and("contain", "3");

    // Make sure URL search params are correct
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
  });

  it("should retain comma-separated values when reverting to default (metabase#25374-3)", () => {
    cy.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Equal to")
      .click();
    cy.dashboardParameterSidebar()
      .findByLabelText("Default value")
      .type("1,2,3");

    cy.saveDashboard();
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    cy.getDashboardCard().findAllByTestId("cell-data").should("have.text", "3");

    cy.button("Clear").click();
    cy.wait("@dashcardQuery");
    cy.getDashboardCard().should(
      "contain.text",
      "There was a problem displaying this chart.",
    );
    cy.location("search").should("eq", "?equal_to=");

    cy.button("Reset filter to default state").click();
    cy.wait("@dashcardQuery");
    cy.getDashboardCard().findAllByTestId("cell-data").should("have.text", "3");
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");

    // Drill-through and go to the question
    cy.getDashboardCard(0).findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    cy.get("[data-testid=cell-data]")
      .should("contain", "COUNT(*)")
      .and("contain", "3");

    cy.location("search").should("eq", "?num=1%2C2%2C3");
  });

  it("should retain comma-separated values when reverting to default via 'Reset all filters' (metabase#25374-4)", () => {
    cy.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Equal to")
      .click();
    cy.dashboardParameterSidebar()
      .findByLabelText("Default value")
      .type("1,2,3");
    cy.saveDashboard();
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    cy.getDashboardCard().findAllByTestId("cell-data").should("have.text", "3");

    cy.button("Clear").click();
    cy.wait("@dashcardQuery");
    cy.location("search").should("eq", "?equal_to=");
    cy.getDashboardCard().should(
      "contain.text",
      "There was a problem displaying this chart.",
    );

    cy.findByLabelText("Move, trash, and more…").click();
    cy.popover().findByText("Reset all filters").should("be.visible").click();
    cy.wait("@dashcardQuery");
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    cy.getDashboardCard().findAllByTestId("cell-data").should("have.text", "3");

    // Drill-through and go to the question
    cy.getDashboardCard(0).findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    cy.get("[data-testid=cell-data]")
      .should("contain", "COUNT(*)")
      .and("contain", "3");

    cy.location("search").should("eq", "?num=1%2C2%2C3");
  });
});

describe("issue 25908", () => {
  const questionDetails = {
    name: "25908",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const dashboardFilter = {
    name: "Text contains",
    slug: "text_contains",
    id: "28c6ada9",
    type: "string/contains",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [dashboardFilter],
  };

  const CASE_INSENSITIVE_ROWS = 30;

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard_id}/dashcard/${id}/card/${card_id}/query`,
        ).as("dashcardQuery");

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 17,
              size_y: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                },
              ],
            },
          ],
        });

        // Note the capital first letter
        cy.visit(`/dashboard/${dashboard_id}?text_contains=Li`);
        cy.wait("@dashcardQuery");
        cy.contains(new RegExp(`^Rows 1-\\d+ of ${CASE_INSENSITIVE_ROWS}$`));
      },
    );
  });

  it("`contains` dashboard filter should respect case insensitivity on a title-drill-through (metabase#25908)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questionDetails.name).click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Title contains Li");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`Showing ${CASE_INSENSITIVE_ROWS} rows`);
  });
});

describe("issue 26230", () => {
  const FILTER_1 = {
    id: "12345678",
    name: "Text",
    slug: "text",
    type: "string/=",
    sectionId: "string",
  };

  const FILTER_2 = {
    id: "87654321",
    name: "Text",
    slug: "text",
    type: "string/=",
    sectionId: "string",
  };

  function prepareAndVisitDashboards() {
    cy.createDashboard({
      name: "dashboard with a tall card",
      parameters: [FILTER_1],
    }).then(({ body: { id } }) => {
      createDashCard(id, FILTER_1);
      bookmarkDashboard(id);
    });

    cy.createDashboard({
      name: "dashboard with a tall card 2",
      parameters: [FILTER_2],
    }).then(({ body: { id } }) => {
      createDashCard(id, FILTER_2);
      bookmarkDashboard(id);
      cy.visitDashboard(id);
    });
  }

  function bookmarkDashboard(dashboardId) {
    cy.request("POST", `/api/bookmark/dashboard/${dashboardId}`);
  }

  function createDashCard(dashboardId, mappedFilter) {
    cy.request("PUT", `/api/dashboard/${dashboardId}`, {
      dashcards: [
        createMockDashboardCard({
          id: -dashboardId,
          dashboard_id: dashboardId,
          size_x: 5,
          size_y: 20,
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              parameter_id: mappedFilter.id,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                [
                  "field",
                  PEOPLE.NAME,
                  { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
                ],
              ],
            },
          ],
        }),
      ],
    });
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    prepareAndVisitDashboards();
  });

  it("should not preserve the sticky filter behavior when navigating to the second dashboard (metabase#26230)", () => {
    cy.findByRole("main").scrollTo("bottom"); // This line is essential for the reproduction!

    cy.button("Toggle sidebar").click();
    cy.findByRole("main")
      .findByDisplayValue("dashboard with a tall card 2")
      .should("not.be.visible");

    cy.findByTestId("dashboard-parameters-widget-container").should(
      "have.css",
      "position",
      "sticky",
    );

    cy.intercept("GET", "/api/dashboard/*").as("loadDashboard");
    cy.findByRole("listitem", { name: "dashboard with a tall card" }).click();
    cy.wait("@loadDashboard");
  });
});

describe("issue 27356", () => {
  const ratingFilter = {
    name: "Text",
    slug: "text",
    id: "5dfco74e",
    type: "string/=",
    sectionId: "string",
  };

  const paramDashboard = {
    name: "Dashboard With Params",
    parameters: [ratingFilter],
  };

  const regularDashboard = {
    name: "Dashboard Without Params",
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.restore();
    cy.signInAsAdmin();

    cy.createDashboard(paramDashboard).then(({ body: { id } }) => {
      cy.request("POST", `/api/bookmark/dashboard/${id}`);
    });

    cy.createDashboard(regularDashboard).then(({ body: { id } }) => {
      cy.request("POST", `/api/bookmark/dashboard/${id}`);
      cy.visitDashboard(id);
    });
  });

  it("should seamlessly move between dashboards with or without filters without triggering an error (metabase#27356)", () => {
    cy.openNavigationSidebar();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(paramDashboard.name).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is looking empty.");

    cy.openNavigationSidebar();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(regularDashboard.name).click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is looking empty.");

    cy.openNavigationSidebar();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(paramDashboard.name).click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is looking empty.");
  });
});

describe("issue 27768", () => {
  const questionDetails = {
    name: "27768",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 5,
      expressions: { CCategory: ["field", PRODUCTS.CATEGORY, null] },
    },
  };

  const filter = {
    name: "Cat",
    slug: "cat",
    id: "b3b436dd",
    type: "string/=",
    sectionId: "string",
  };

  function getFilterOptions(filterName) {
    cy.findByText(filterName).find(".Icon-gear").click();
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [filter],
        });

        cy.visitDashboard(dashboard_id, { queryParams: { cat: "Gizmo" } });
      },
    );
  });

  it("filter connected to custom column should visually indicate it is connected (metabase#27768)", () => {
    // We need to manually connect the filter to the custom column using the UI,
    // but when we fix the issue, it should be safe to do this via API
    cy.editDashboard();
    getFilterOptions(filter.name);

    cy.getDashboardCard().findByText("Select…").click();
    cy.popover().contains("CCategory").click();
    cy.saveDashboard();

    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.fieldValuesInput().type("Gizmo");
      cy.button("Add filter").click();
    });

    cy.findAllByText("Doohickey").should("not.exist");

    // Make sure the filter is still connected to the custom column
    cy.editDashboard();
    getFilterOptions(filter.name);

    cy.getDashboardCard().within(() => {
      cy.findByText("Select…").should("not.exist");
      cy.contains("Products.CCategory");
    });
  });
});

describe("issues 29347, 29346", () => {
  const filterValue = 100;

  const filterDetails = {
    name: "Text",
    slug: "text",
    id: "11d79abe",
    type: "string/=",
    sectionId: "string",
  };

  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
    },
  };

  const editableDashboardDetails = {
    parameters: [filterDetails],
    enable_embedding: true,
    embedding_params: {
      [filterDetails.slug]: "enabled",
    },
  };

  const lockedDashboardDetails = {
    parameters: [filterDetails],
    enable_embedding: true,
    embedding_params: {
      [filterDetails.slug]: "locked",
    },
  };

  const getRemappedValue = fieldValue => {
    return `N${fieldValue}`;
  };

  const addFieldRemapping = fieldId => {
    cy.request("PUT", `/api/field/${fieldId}`, {
      semantic_type: "type/Category",
    });

    cy.request("POST", `/api/field/${fieldId}/dimension`, {
      name: "Quantity",
      type: "internal",
    });

    cy.request("GET", `/api/field/${fieldId}/values`).then(
      ({ body: { values } }) => {
        cy.request("POST", `/api/field/${fieldId}/values`, {
          values: values.map(([value]) => [value, getRemappedValue(value)]),
        });
      },
    );
  };

  const createDashboard = ({
    dashboardDetails = editableDashboardDetails,
  } = {}) => {
    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: filterDetails.id,
                  card_id,
                  target: ["dimension", ["field", ORDERS.QUANTITY, null]],
                },
              ],
            },
          ],
        });

        cy.wrap(dashboard_id).as("dashboardId");
      },
    );
  };

  const filterOnRemappedValues = fieldValue => {
    cy.filterWidget().within(() => {
      cy.findByText(filterDetails.name).click();
    });

    cy.popover().within(() => {
      cy.findByText(getRemappedValue(fieldValue)).click();
      cy.button("Add filter").click();
    });
  };

  const verifyRemappedValues = fieldValue => {
    verifyRemappedFilterValues(filterValue);
    verifyRemappedCardValues(fieldValue);
  };

  const verifyRemappedFilterValues = fieldValue => {
    cy.filterWidget().within(() => {
      cy.findByText(getRemappedValue(fieldValue)).should("be.visible");
    });
  };

  const verifyRemappedCardValues = fieldValue => {
    cy.getDashboardCard().within(() => {
      cy.findAllByText(getRemappedValue(fieldValue)).should("have.length", 2);
    });
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    addFieldRemapping(ORDERS.QUANTITY);
  });

  describe("regular dashboards", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/dashboard/*").as("dashboard");
      cy.intercept("POST", "/api/dashboard/**/card/*/query").as("cardQuery");
    });

    it("should be able to filter on remapped values (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.visitDashboard("@dashboardId");
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.visitDashboard("@dashboardId", {
        params: { [filterDetails.slug]: filterValue },
      });

      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });
  });

  describe("embedded dashboards", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/embed/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/embed/dashboard/**/card/*").as("cardQuery");
    });

    it("should be able to filter on remapped values (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId =>
        cy.visitEmbeddedPage({
          resource: { dashboard: dashboardId },
          params: {},
        }),
      );
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the token (metabase#29347, metabase#29346)", () => {
      createDashboard({ dashboardDetails: lockedDashboardDetails });
      cy.get("@dashboardId").then(dashboardId => {
        cy.visitEmbeddedPage({
          resource: { dashboard: dashboardId },
          params: {
            [filterDetails.slug]: filterValue,
          },
        });
      });
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedCardValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId => {
        cy.visitEmbeddedPage(
          {
            resource: { dashboard: dashboardId },
            params: {},
          },
          {
            setFilters: { [filterDetails.slug]: filterValue },
          },
        );
      });
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });
  });

  describe("public dashboards", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/public/dashboard/*").as("dashboard");
      cy.intercept("GET", "/api/public/dashboard/**/card/*").as("cardQuery");
    });

    it("should be able to filter on remapped values (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId =>
        cy.visitPublicDashboard(dashboardId),
      );
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then(dashboardId => {
        cy.visitPublicDashboard(dashboardId, {
          params: { [filterDetails.slug]: filterValue },
        });
      });
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });
  });
});

describe("issue 31662", () => {
  const parameterDetails = {
    name: "Between",
    slug: "between",
    id: "b6ed2d71",
    type: "number/between",
    sectionId: "number",
    default: [3, 5],
  };
  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.intercept("/api/dashboard/*").as("dashboard");
  });

  it("should allow setting default values for a not connected between filter (metabase#31662)", () => {
    cy.createDashboard(dashboardDetails).then(
      ({ body: { id: dashboardId } }) => {
        cy.visit(`dashboard/${dashboardId}?between=10&between=20`);
        cy.wait("@dashboard");
      },
    );
    cy.findByTestId("dashboard-empty-state").should("be.visible");
    cy.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Between")
      .click();
    cy.sidebar().findByText("2 selections").click();
    cy.popover().within(() => {
      cy.findByDisplayValue("3").should("be.visible");
      cy.findByDisplayValue("5").should("be.visible");
    });
  });
});

describe("issue 38245", () => {
  function filterPanel() {
    return cy.findByTestId("edit-dashboard-parameters-widget-container");
  }

  function mapDashCardToFilter(dashcardElement, filterName, columnName) {
    filterPanel().findByText(filterName).click();
    cy.selectDashboardFilter(dashcardElement, columnName);
    cy.sidebar().button("Done").click();
  }
  const TAB_1 = {
    id: 1,
    name: "Tab 1",
  };

  const TAB_2 = {
    id: 2,
    name: "Tab 2",
  };

  const DASHBOARD_TEXT_FILTER = createMockParameter({
    id: "3",
    name: "Text filter",
    slug: "filter-text",
    type: "string/contains",
  });

  beforeEach(() => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should not make a request to the server if the parameters are not saved (metabase#38245)", () => {
    cy.createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [DASHBOARD_TEXT_FILTER],
      dashcards: [],
    }).then(dashboard => cy.visitDashboard(dashboard.id));

    cy.editDashboard();
    cy.openQuestionsSidebar();

    cy.sidebar().findByText("Orders").click();

    cy.wait("@cardQuery");

    mapDashCardToFilter(
      cy.getDashboardCard(),
      DASHBOARD_TEXT_FILTER.name,
      "Source",
    );

    cy.goToTab(TAB_2.name);
    cy.goToTab(TAB_1.name);

    cy.getDashboardCard().within(() => {
      cy.findByText("Orders").should("exist");
      cy.findByText("Product ID").should("exist");
      cy.findByText(/(Problem|Error)/i).should("not.exist");
    });

    cy.get("@cardQuery.all").should("have.length", 2);
    cy.get("@cardQuery").should(({ response }) => {
      expect(response.statusCode).not.to.eq(500);
    });
  });
});

describe("issue 43154", () => {
  const modelDetails = {
    name: "Model",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          alias: "People - User",
          condition: [
            "=",
            ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }],
            [
              "field",
              PEOPLE.ID,
              { "base-type": "type/BigInteger", "join-alias": "People - User" },
            ],
          ],
          "source-table": PEOPLE_ID,
        },
      ],
    },
  };

  const questionDetails = modelId => ({
    name: "Question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });

  const questionWithAggregationDetails = modelId => ({
    name: "Question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [["count"]],
    },
  });

  function verifyNestedFilter(questionDetails) {
    cy.createQuestion(modelDetails).then(({ body: model }) => {
      cy.createDashboardWithQuestions({
        questions: [questionDetails(model.id)],
      }).then(({ dashboard }) => {
        cy.visitDashboard(dashboard.id);
      });
    });

    cy.editDashboard();
    cy.setFilter("Text or Category", "Is");
    cy.getDashboardCard().findByText("Select…").click();
    cy.popover().findByText("People - User → Source").click();
    cy.saveDashboard();

    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText("Twitter").click();
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to see field values with a model-based question (metabase#43154)", () => {
    verifyNestedFilter(questionDetails);
  });

  it("should be able to see field values with a model-based question with aggregation (metabase#43154)", () => {
    verifyNestedFilter(questionWithAggregationDetails);
  });
});

describe("issue 42829", () => {
  const modelDetails = {
    name: "SQL model",
    type: "model",
    native: {
      query: "SELECT * FROM PEOPLE",
    },
  };

  const stateFieldDetails = {
    id: PEOPLE.STATE,
    display_name: "State",
    semantic_type: "type/State",
  };

  const getQuestionDetails = modelId => ({
    name: "SQL model-based question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [
        ["distinct", ["field", "STATE", { "base-type": "type/Text" }]],
      ],
    },
    display: "scalar",
  });

  const parameterDetails = {
    name: "State",
    slug: "state",
    id: "5aefc725",
    type: "string/=",
    sectionId: "location",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  const getParameterMapping = questionId => ({
    parameter_id: parameterDetails.id,
    card_id: questionId,
    target: ["dimension", ["field", "STATE", { "base-type": "type/Text" }]],
  });

  function filterAndVerifyResults() {
    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText("AK").click();
      cy.findByText("AR").click();
      cy.button("Add filter").click();
    });
    cy.getDashboardCard().findByTestId("scalar-value").should("have.text", "2");
  }

  function drillAndVerifyResults() {
    cy.getDashboardCard().findByText("SQL model-based question").click();
    cy.findByTestId("qb-filters-panel").findByText("State is 2 selections");
    cy.findByTestId("scalar-value").should("have.text", "2");
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(modelDetails).then(({ body: model }) => {
      // populate result_metadata
      cy.request("POST", `/api/card/${model.id}/query`);
      cy.setModelMetadata(model.id, field => {
        if (field.display_name === "STATE") {
          return { ...field, ...stateFieldDetails };
        }
        return field;
      });
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [getQuestionDetails(model.id)],
      }).then(({ dashboard, questions: [question] }) => {
        cy.updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: question.id,
              parameter_mappings: [getParameterMapping(question.id)],
            },
          ],
        });
        cy.wrap(dashboard.id).as("dashboardId");
      });
    });
  });

  it("should be able to get field values coming from a sql model-based question in a regular dashboard (metabase#42829)", () => {
    cy.visitDashboard("@dashboardId");
    filterAndVerifyResults();
    drillAndVerifyResults();
  });

  it("should be able to get field values coming from a sql model-based question in a public dashboard (metabase#42829)", () => {
    cy.get("@dashboardId").then(dashboardId =>
      cy.visitPublicDashboard(dashboardId),
    );
    filterAndVerifyResults();
  });

  it("should be able to get field values coming from a sql model-based question in a embedded dashboard (metabase#42829)", () => {
    cy.get("@dashboardId").then(dashboardId =>
      cy.visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    filterAndVerifyResults();
  });
});

describe("issue 43799", () => {
  const modelDetails = {
    name: "43799",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          alias: "People - User",
          condition: [
            "=",
            [
              "field",
              ORDERS.USER_ID,
              {
                "base-type": "type/Integer",
              },
            ],
            [
              "field",
              PEOPLE.ID,
              {
                "base-type": "type/BigInteger",
                "join-alias": "People - User",
              },
            ],
          ],
          "source-table": PEOPLE_ID,
        },
      ],
      aggregation: [
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
        [
          "sum",
          [
            "field",
            ORDERS.SUBTOTAL,
            {
              "base-type": "type/Float",
            },
          ],
        ],
      ],
      breakout: [
        [
          "field",
          PEOPLE.SOURCE,
          {
            "base-type": "type/Text",
            "join-alias": "People - User",
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
      ],
    },
  };

  beforeEach(() => {
    cy.signInAsNormalUser();
  });

  it("should be able to map a parameter to an explicitly joined column in the model query", () => {
    cy.createDashboardWithQuestions({ questions: [modelDetails] }).then(
      ({ dashboard }) => {
        cy.visitDashboard(dashboard.id);
      },
    );
    cy.editDashboard();
    cy.findByTestId("dashboard-header")
      .findByLabelText("Add a filter or parameter")
      .click();
    cy.popover().findByText("Text or Category").click();
    cy.getDashboardCard().findByText("Select…").click();
    cy.popover().findByText("People - User → Source").click();
    cy.saveDashboard();
    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText("Google").click();
      cy.button("Add filter").click();
    });
    cy.getDashboardCard().findByText("43799").click();
    cy.findByTestId("qb-filters-panel")
      .findByText("People - User → Source is Google")
      .should("be.visible");
    cy.assertQueryBuilderRowCount(4);
  });
});

describe("issue 44288", () => {
  const questionDetails = {
    name: "SQL question",
    type: "question",
    query: { "source-table": PRODUCTS_ID, limit: 10 },
  };

  const modelDetails = {
    name: "SQL model",
    type: "model",
    native: { query: "SELECT * FROM PRODUCTS LIMIT 10" },
  };

  const parameterDetails = {
    name: "Text",
    slug: "text",
    id: "27454068",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function getDashcardDetails(dashboard, question, model) {
    return {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: question.id,
          parameter_mappings: [
            {
              card_id: question.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
        {
          card_id: model.id,
          parameter_mappings: [
            {
              card_id: model.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                ["field", "CATEGORY", { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      ],
    };
  }

  function verifyMapping() {
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText(parameterDetails.name)
      .click();
    cy.getDashboardCard(0).within(() => {
      cy.findByText(/Category/i).should("be.visible");
    });
    cy.getDashboardCard(1).within(() => {
      cy.findByText(/Category/i).should("not.exist");
      cy.findByText(/Models are data sources/).should("be.visible");
    });
  }

  function verifyFilter() {
    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    cy.getDashboardCard(0).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findByText("Doohickey").should("not.exist");
    });
    cy.getDashboardCard(1).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findAllByText("Doohickey").should("have.length.gte", 1);
    });
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.createQuestion(questionDetails).then(({ body: question }) => {
      cy.createNativeQuestion(modelDetails).then(({ body: model }) => {
        cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
          cy.updateDashboardCards(
            getDashcardDetails(dashboard, question, model),
          );
          cy.wrap(dashboard.id).as("dashboardId");
        });
      });
    });
    cy.signOut();
  });

  it("should ignore parameter mappings to a native model in a dashboard (metabase#44288)", () => {
    cy.log("regular dashboards");
    cy.signInAsNormalUser();
    cy.visitDashboard("@dashboardId");
    cy.editDashboard();
    verifyMapping();
    cy.saveDashboard({ awaitRequest: false });
    verifyFilter();
    cy.signOut();

    cy.log("public dashboards");
    cy.signInAsAdmin();
    cy.get("@dashboardId").then(dashboardId =>
      cy.visitPublicDashboard(dashboardId),
    );
    verifyFilter();

    cy.log("embedded dashboards");
    cy.get("@dashboardId").then(dashboardId =>
      cy.visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    verifyFilter();
  });
});

describe("issue 27579", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to remove the last exclude hour option (metabase#27579)", () => {
    cy.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.editDashboard();
    cy.setFilter("Date picker", "All Options");
    cy.selectDashboardFilter(cy.getDashboardCard(), "Created At");
    cy.saveDashboard();
    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText("Exclude…").click();
      cy.findByText("Hours of the day…").click();
      cy.findByText("Select all").click();
      cy.findByLabelText("12 AM").should("be.checked");

      cy.findByText("Select none").click();
      cy.findByLabelText("12 AM").should("not.be.checked");
    });
  });
});

describe("issue 32804", () => {
  const question1Details = {
    name: "Q1",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const parameterDetails = {
    name: "Number",
    slug: "number",
    id: "27454068",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  const getQuestion2Details = card => ({
    name: "Q2",
    query: {
      "source-table": `card__${card.id}`,
      filter: [
        "=",
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
        "Gadget",
      ],
    },
  });

  const getParameterMapping = card => ({
    card_id: card.id,
    parameter_id: parameterDetails.id,
    target: [
      "dimension",
      ["field", PRODUCTS.RATING, { "base-type": "type/Integer" }],
    ],
  });

  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should retain source query filters when drilling-thru from a dashboard (metabase#32804)", () => {
    cy.createQuestion(question1Details).then(({ body: card1 }) => {
      cy.createDashboardWithQuestions({
        dashboardDetails,
        questions: [getQuestion2Details(card1)],
      }).then(({ dashboard, questions: [card2] }) => {
        cy.updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: card2.id,
              parameter_mappings: [getParameterMapping(card2)],
            },
          ],
        });
        cy.visitDashboard(dashboard.id, {
          params: { [parameterDetails.slug]: "4" },
        });
      });
    });
    cy.filterWidget().findByText("4").should("be.visible");
    cy.getDashboardCard(0).findByText("Q2").click();
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Gadget").should("be.visible");
      cy.findByText("Rating is equal to 4").should("be.visible");
    });
  });
});

describe("issue 44231", () => {
  const parameterDetails = {
    id: "92eb69ea",
    name: "ID",
    sectionId: "id",
    slug: "id",
    type: "id",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function getPkCardDetails(type) {
    return {
      name: "Products",
      type,
      query: { "source-table": PRODUCTS_ID },
    };
  }

  function getFkCardDetails(type) {
    return {
      name: "Orders",
      type: "model",
      query: { "source-table": ORDERS_ID },
    };
  }

  function getDashcardDetails(type, dashboard, pkCard, fkCard) {
    return {
      dashboard_id: dashboard.id,
      cards: [
        {
          card_id: pkCard.id,
          parameter_mappings: [
            {
              card_id: pkCard.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                [
                  "field",
                  type === "model" ? "ID" : PRODUCTS.ID,
                  { "base-type": "type/BigInteger" },
                ],
              ],
            },
          ],
        },
        {
          card_id: fkCard.id,
          parameter_mappings: [
            {
              card_id: fkCard.id,
              parameter_id: parameterDetails.id,
              target: [
                "dimension",
                [
                  "field",
                  type === "model" ? "PRODUCT_ID" : ORDERS.PRODUCT_ID,
                  { "base-type": "type/BigInteger" },
                ],
              ],
            },
          ],
        },
      ],
    };
  }

  function verifyFilterByRemappedValue() {
    const productId = 144;
    const productName = "Aerodynamic Bronze Hat";

    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByText(productName).click();
      cy.button("Add filter").click();
    });
    cy.getDashboardCard(0).findByText(productName).should("be.visible");
    cy.getDashboardCard(1)
      .findAllByText(String(productId))
      .should("have.length.above", 0);
  }

  function verifyFieldMapping(type) {
    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [getPkCardDetails(type), getFkCardDetails(type)],
    }).then(({ dashboard, questions: [pkCard, fkCard] }) => {
      cy.updateDashboardCards(
        getDashcardDetails(type, dashboard, pkCard, fkCard),
      );

      cy.visitDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      cy.visitPublicDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      cy.visitEmbeddedPage({
        resource: { dashboard: dashboard.id },
        params: {},
      });
      verifyFilterByRemappedValue();
    });
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${PRODUCTS.ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
      semantic_type: "type/Name",
    });
  });

  it("should allow filtering by remapped values with questions (metabase#44231)", () => {
    verifyFieldMapping("question");
  });

  it("should allow filtering by remapped values with models (metabase#44231)", () => {
    verifyFieldMapping("model");
  });
});

describe("44047", () => {
  const questionDetails = {
    name: "Question",
    type: "question",
    query: {
      "source-table": REVIEWS_ID,
      limit: 100,
    },
  };

  const modelDetails = {
    name: "Model",
    type: "model",
    query: {
      "source-table": REVIEWS_ID,
      limit: 100,
    },
  };

  const sourceQuestionDetails = {
    name: "Source question",
    type: "question",
    query: {
      "source-table": REVIEWS_ID,
      fields: [
        ["field", REVIEWS.ID, { "base-type": "type/BigInteger" }],
        ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
      ],
    },
  };

  const parameterDetails = {
    name: "Text",
    slug: "text",
    id: "5a425670",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getQuestionDashcardDetails(dashboard, card) {
    return {
      dashboard_id: dashboard.id,
      card_id: card.id,
      parameter_mappings: [
        {
          card_id: card.id,
          parameter_id: parameterDetails.id,
          target: [
            "dimension",
            ["field", REVIEWS.RATING, { type: "type/Integer" }],
          ],
        },
      ],
    };
  }

  function getModelDashcardDetails(dashboard, card) {
    return {
      dashboard_id: dashboard.id,
      card_id: card.id,
      parameter_mappings: [
        {
          card_id: card.id,
          parameter_id: parameterDetails.id,
          target: ["dimension", ["field", "RATING", { type: "type/Integer" }]],
        },
      ],
    };
  }

  function verifyFilterWithRemapping() {
    cy.filterWidget().click();
    cy.popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("Remapped");
      cy.findByText("Remapped").click();
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      semantic_type: "type/Category",
    });
    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });
    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [[1, "Remapped"]],
    });
  });

  it("should be able to use remapped values from an integer field with an overridden semantic type used for a custom dropdown source in public dashboards (metabase#44047)", () => {
    cy.createQuestion(sourceQuestionDetails);
    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails, modelDetails],
    }).then(({ dashboard, questions: cards }) => {
      cy.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          getQuestionDashcardDetails(dashboard, cards[0]),
          getModelDashcardDetails(dashboard, cards[1]),
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.log("verify filtering works in a regular dashboard");
    cy.visitDashboard("@dashboardId");
    verifyFilterWithRemapping();

    cy.log("verify filtering works in a public dashboard");
    cy.get("@dashboardId").then(cy.visitPublicDashboard);
    verifyFilterWithRemapping();
  });
});

describe("issue 45659", () => {
  const parameterDetails = {
    name: "ID",
    slug: "id",
    id: "f8ec7c71",
    type: "id",
    sectionId: "id",
    default: [10],
  };

  const questionDetails = {
    name: "People",
    query: { "source-table": PEOPLE_ID },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
    enable_embedding: true,
    embedding_params: {
      [parameterDetails.slug]: "enabled",
    },
  };

  function createDashboard() {
    return cy
      .createDashboardWithQuestions({
        dashboardDetails,
        questions: [questionDetails],
      })
      .then(({ dashboard, questions: [card] }) => {
        cy.addOrUpdateDashboardCard({
          dashboard_id: dashboard.id,
          card_id: card.id,
          card: {
            parameter_mappings: [
              {
                card_id: card.id,
                parameter_id: parameterDetails.id,
                target: [
                  "dimension",
                  ["field", PEOPLE.ID, { "base-type": "type/BigInteger" }],
                ],
              },
            ],
          },
        }).then(() => ({ dashboard }));
      });
  }

  function verifyFilterWithRemapping() {
    cy.filterWidget().findByText("Tressa White").should("be.visible");
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${PEOPLE.ID}`, {
      has_field_values: "list",
    });
  });

  it("should remap initial parameter values in public dashboards (metabase#45659)", () => {
    createDashboard().then(({ dashboard }) =>
      cy.visitPublicDashboard(dashboard.id),
    );
    verifyFilterWithRemapping();
  });

  it("should remap initial parameter values in embedded dashboards (metabase#45659)", () => {
    createDashboard().then(({ dashboard }) =>
      cy.visitEmbeddedPage({
        resource: { dashboard: dashboard.id },
        params: {},
      }),
    );
    verifyFilterWithRemapping();
  });
});

describe("44266", () => {
  const filterDetails = {
    name: "Equal to",
    slug: "equal_to",
    id: "10c0d4ba",
    type: "number/=",
    sectionId: "number",
  };

  const dashboardDetails = {
    name: "44266",
    parameters: [filterDetails],
  };

  const regularQuestion = {
    name: "regular",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const nativeQuestion = {
    name: "native",
    native: {
      query:
        "SELECT * from products where true [[ and price > {{price}}]] limit 5;",
      "template-tags": {
        price: {
          type: "number",
          name: "price",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": "Price",
        },
      },
    },
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping when native and regular questions can be mapped (metabase#44266)", () => {
    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [regularQuestion, nativeQuestion],
    }).then(({ dashboard }) => {
      cy.visitDashboard(dashboard.id);
      cy.editDashboard();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Equal to")
        .click();

      cy.getDashboardCard(1).findByText("Select…").click();

      cy.popover().findByText("Price").click();

      cy.getDashboardCard(1).findByText("Price").should("be.visible");
    });
  });
});

describe("issue 44790", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should handle string values passed to number and id filters (metabase#44790)", () => {
    const idFilter = {
      id: "92eb69ea",
      name: "ID",
      sectionId: "id",
      slug: "id",
      type: "id",
    };

    const numberFilter = {
      id: "10c0d4ba",
      name: "Equal to",
      slug: "equal_to",
      type: "number/=",
      sectionId: "number",
    };

    const peopleQuestionDetails = {
      query: { "source-table": PEOPLE_ID, limit: 5 },
    };

    cy.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [idFilter, numberFilter],
      },
      questions: [peopleQuestionDetails],
    }).then(({ dashboard, questions: cards }) => {
      const [peopleCard] = cards;

      cy.wrap(dashboard.id).as("dashboardId");

      cy.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: peopleCard.id,
            parameter_mappings: [
              {
                parameter_id: idFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.ID, null]],
              },
              {
                parameter_id: numberFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.LATITUDE, null]],
              },
            ],
          },
        ],
      });
    });

    cy.log("wrong value for id filter should be ignored");
    cy.visitDashboard("@dashboardId", {
      params: {
        [idFilter.slug]: "{{test}}",
      },
    });
    cy.getDashboardCard().should("contain", "borer-hudson@yahoo.com");

    cy.log("wrong value for number filter should be ignored");
    cy.visitDashboard("@dashboardId", {
      params: {
        [numberFilter.slug]: "{{test}}",
        [idFilter.slug]: "1",
      },
    });
    cy.getDashboardCard().should("contain", "borer-hudson@yahoo.com");
  });
});

describe("issue 34955", () => {
  const ccName = "Custom Created At";

  const questionDetails = {
    name: "34955",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        [ccName]: [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime" },
        ],
      },
      fields: [
        [
          "field",
          ORDERS.ID,
          {
            "base-type": "type/BigInteger",
          },
        ],
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
          },
        ],
        [
          "expression",
          ccName,
          {
            "base-type": "type/DateTime",
          },
        ],
      ],
      limit: 2,
    },
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({
      questionDetails,
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");

      cy.visitDashboard(dashboard_id);
      cy.editDashboard();

      cy.setFilter("Date picker", "Single Date", "On");
      connectFilterToColumn(ccName);

      cy.setFilter("Date picker", "Date Range", "Between");
      connectFilterToColumn(ccName);

      cy.saveDashboard();

      cy.findAllByTestId("column-header")
        .eq(-2)
        .should("have.text", "Created At");
      cy.findAllByTestId("column-header").eq(-1).should("have.text", ccName);
      cy.findAllByTestId("cell-data")
        .filter(":contains(May 15, 2024, 8:04 AM)")
        .should("have.length", 2);
    });
  });

  it("should connect specific date filter (`Between`) to the temporal custom column (metabase#34955-1)", () => {
    cy.get("@dashboardId").then(dashboard_id => {
      // Apply filter through URL to prevent the typing flakes
      cy.visit(`/dashboard/${dashboard_id}?on=&between=2024-01-01~2024-03-01`);
      cy.findAllByTestId("field-set-content")
        .last()
        .should("contain", "January 1, 2024 - March 1, 2024");

      cy.findAllByTestId("cell-data")
        .filter(":contains(January 1, 2024, 7:26 AM)")
        .should("have.length", 2);
    });
  });

  // TODO: Once the issue is fixed, merge into a single repro to avoid unnecessary overhead!
  it.skip("should connect specific date filter (`On`) to the temporal custom column (metabase#34955-2)", () => {
    cy.get("@dashboardId").then(dashboard_id => {
      // Apply filter through URL to prevent the typing flakes
      cy.visit(`/dashboard/${dashboard_id}?on=2024-01-01&between=`);
      cy.findAllByTestId("field-set-content")
        .first()
        .should("contain", "January 1, 2024");

      cy.findAllByTestId("cell-data")
        .filter(":contains(January 1, 2024, 7:26 AM)")
        .should("have.length", 2);
    });
  });

  function connectFilterToColumn(column) {
    cy.getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.findByText("Select…").click();
    });

    cy.popover().within(() => {
      cy.findByText(column).click();
    });
  }
});

describe("issue 35852", () => {
  const model = {
    name: "35852 - sql",
    type: "model",
    native: {
      query: "SELECT * FROM PRODUCTS LIMIT 10",
    },
  };

  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should show filter values for a model based on sql query (metabase#35852)", () => {
    cy.createNativeQuestion(model).then(({ body: { id: modelId } }) => {
      cy.setModelMetadata(modelId, field => {
        if (field.display_name === "CATEGORY") {
          return {
            ...field,
            id: PRODUCTS.CATEGORY,
            display_name: "Category",
            semantic_type: "type/Category",
            fk_target_field_id: null,
          };
        }

        return field;
      });

      createDashboardWithFilterAndQuestionMapped(modelId);
      cy.visitModel(modelId);
    });

    cy.tableHeaderClick("Category");
    cy.popover().findByText("Filter by this column").click();

    cy.log("Verify filter values are available");

    cy.popover()
      .should("contain", "Gizmo")
      .should("contain", "Doohickey")
      .should("contain", "Gadget")
      .should("contain", "Widget");

    cy.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.log("Verify filter is applied");

    cy.findAllByTestId("cell-data")
      .filter(":contains(Gizmo)")
      .should("have.length", 2);

    cy.visitDashboard("@dashboardId");

    cy.filterWidget().click();

    cy.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.getDashboardCard().findAllByText("Gizmo").should("have.length", 2);
  });

  function createDashboardWithFilterAndQuestionMapped(modelId) {
    const parameterDetails = {
      name: "Category",
      slug: "category",
      id: "2a12e66c",
      type: "string/=",
      sectionId: "string",
    };

    const dashboardDetails = {
      parameters: [parameterDetails],
    };

    const questionDetails = {
      name: "Q1",
      query: { "source-table": `card__${modelId}`, limit: 10 },
    };

    cy.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions: [card] }) => {
      cy.wrap(dashboard.id).as("dashboardId");

      cy.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: [
              {
                card_id: card.id,
                parameter_id: parameterDetails.id,
                target: [
                  "dimension",
                  ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
                ],
              },
            ],
          },
        ],
      });
    });
  }
});

describe("issue 32573", () => {
  const modelDetails = {
    name: "M1",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
      fields: [["field", ORDERS.TAX, null]],
    },
  };

  const parameterDetails = {
    id: "92eb69ea",
    name: "ID",
    sectionId: "id",
    slug: "id",
    type: "id",
    default: 1,
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getQuestionDetails(modelId) {
    return {
      name: "Q1",
      type: "question",
      query: {
        "source-table": `card__${modelId}`,
      },
    };
  }

  function getParameterMapping(questionId) {
    return {
      card_id: questionId,
      parameter_id: parameterDetails.id,
      target: [
        "dimension",
        ["field", "ID", { "base-type": "type/BigInteger" }],
      ],
    };
  }

  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should not crash a dashboard when there is a missing parameter column (metabase#32573)", () => {
    cy.createQuestion(modelDetails).then(({ body: model }) => {
      cy.createQuestion(getQuestionDetails(model.id)).then(
        ({ body: question }) => {
          cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
            return cy
              .request("PUT", `/api/dashboard/${dashboard.id}`, {
                dashcards: [
                  createMockDashboardCard({
                    card_id: question.id,
                    parameter_mappings: [getParameterMapping(question.id)],
                    size_x: 6,
                    size_y: 6,
                  }),
                ],
              })
              .then(() => cy.visitDashboard(dashboard.id));
          });
        },
      );
    });
    cy.getDashboardCard()
      .findByText("There was a problem displaying this chart.")
      .should("be.visible");

    cy.editDashboard();
    cy.findByTestId("fixed-width-filters").findByText("ID").click();
    cy.getDashboardCard().within(() => {
      cy.findByText("Unknown Field").should("be.visible");
      cy.findByLabelText("Disconnect").click();
    });
    cy.saveDashboard();
    cy.getDashboardCard().within(() => {
      cy.findByText("Q1").should("be.visible");
      cy.findByText("Tax").should("be.visible");
    });
  });
});

describe("issue 45670", { tags: ["@external"] }, () => {
  const dialect = "postgres";
  const tableName = "many_data_types";

  const parameterDetails = {
    id: "92eb69ea",
    name: "boolean",
    type: "string/=",
    slug: "boolean",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  function getField() {
    return cy.request("GET", "/api/table").then(({ body: tables }) => {
      const table = tables.find(table => table.name === tableName);
      return cy
        .request("GET", `/api/table/${table.id}/query_metadata`)
        .then(({ body: metadata }) => {
          const { fields } = metadata;
          return fields.find(field => field.name === "boolean");
        });
    });
  }

  function getQuestionDetails(fieldId) {
    return {
      database: WRITABLE_DB_ID,
      native: {
        query: "SELECT id, boolean FROM many_data_types WHERE {{boolean}}",
        "template-tags": {
          boolean: {
            id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
            name: "boolean",
            type: "dimension",
            "display-name": "Boolean",
            dimension: ["field", fieldId, null],
            "widget-type": "string/=",
          },
        },
      },
    };
  }

  function getParameterMapping(cardId) {
    return {
      card_id: cardId,
      parameter_id: parameterDetails.id,
      target: ["dimension", ["template-tag", parameterDetails.name]],
    };
  }

  beforeEach(() => {
    cy.resetTestTable({ type: dialect, table: tableName });
    cy.restore(`${dialect}-writable`);
    cy.signInAsAdmin();
    cy.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName });
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should be able to pass query string parameters for boolean parameters in dashboards (metabase#45670)", () => {
    getField().then(field => {
      cy.createNativeQuestion(getQuestionDetails(field.id)).then(
        ({ body: card }) => {
          cy.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
            cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
              dashcards: [
                createMockDashboardCard({
                  card_id: card.id,
                  parameter_mappings: [getParameterMapping(card.id, field.id)],
                  size_x: 8,
                  size_y: 8,
                }),
              ],
            });
            cy.visitDashboard(dashboard.id, {
              params: {
                [parameterDetails.slug]: "true",
              },
            });
          });
        },
      );
    });
    cy.filterWidget().should("contain.text", "true");
    cy.getDashboardCard().within(() => {
      cy.findByText("true").should("be.visible");
      cy.findByText("false").should("not.exist");
    });
  });
});

describe("issue 48351", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should navigate to the specified tab with click behaviors (metabase#48351)", () => {
    cy.createDashboardWithTabs({
      name: "Dashboard 1",
      tabs: [
        { id: 1, name: "Tab 1" },
        { id: 2, name: "Tab 2" },
      ],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 1,
          size_x: 8,
          size_y: 8,
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: 2,
          col: 8,
          size_x: 8,
          size_y: 8,
        }),
      ],
    }).then(dashboard1 => {
      cy.createDashboardWithTabs({
        name: "Dashboard 2",
        tabs: [
          { id: 3, name: "Tab 3" },
          { id: 4, name: "Tab 4" },
        ],
        dashcards: [
          createMockDashboardCard({
            id: -1,
            card_id: ORDERS_QUESTION_ID,
            dashboard_tab_id: 3,
            size_x: 8,
            size_y: 8,
          }),
          createMockDashboardCard({
            id: -2,
            card_id: ORDERS_QUESTION_ID,
            dashboard_tab_id: 4,
            visualization_settings: {
              column_settings: {
                '["name","ID"]': {
                  click_behavior: {
                    type: "link",
                    linkType: "dashboard",
                    targetId: dashboard1.id,
                    tabId: dashboard1.tabs[1].id,
                    parameterMapping: {},
                  },
                },
              },
            },
            col: 8,
            size_x: 8,
            size_y: 8,
          }),
        ],
      }).then(dashboard2 => cy.visitDashboard(dashboard2.id));
    });
    cy.goToTab("Tab 4");
    cy.getDashboardCard().within(() =>
      cy.findAllByTestId("cell-data").eq(0).click(),
    );
    cy.findByTestId("dashboard-name-heading").should(
      "have.value",
      "Dashboard 1",
    );
    cy.assertTabSelected("Tab 2");
  });
});
