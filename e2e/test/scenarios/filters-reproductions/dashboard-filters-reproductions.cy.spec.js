const { H } = cy;

import dayjs from "dayjs";

import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
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
    return H.createQuestion(question1Details).then(
      ({ body: { id: card1_id } }) => {
        return H.createQuestion(question2Details).then(
          ({ body: { id: card2_id } }) => {
            return H.createDashboard(dashboardDetails).then(
              ({ body: { id: dashboard_id } }) => {
                return { dashboard_id, card1_id, card2_id };
              },
            );
          },
        );
      },
    );
  };

  const setFilterMapping = ({ dashboard_id, card1_id, card2_id }) => {
    return H.updateDashboardCards({
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

  const addFilterValue = (value) => {
    H.filterWidget().click();
    cy.findByText(value).click();
    cy.button("Add filter").click();
  };

  describe("issue 8030", () => {
    beforeEach(() => {
      H.restore();
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
            H.dashboardParametersPopover().within(() => {
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
      H.restore();
      cy.signInAsAdmin();
    });

    it("should not reload dashboard cards not connected to a filter (metabase#32444)", () => {
      H.createDashboardWithQuestions({
        questions: [question1Details, questionWithFilter],
      }).then(({ dashboard }) => {
        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard.id}/dashcard/*/card/*/query`,
        ).as("getCardQuery");

        H.visitDashboard(dashboard.id);
        H.editDashboard(dashboard.id);

        cy.get("@getCardQuery.all").should("have.length", 2);

        H.setFilter("Text or Category", "Is");
        H.selectDashboardFilter(
          cy.findAllByTestId("dashcard").first(),
          "Title",
        );

        H.undoToast().findByRole("button", { name: "Auto-connect" }).click();

        cy.findAllByTestId("dashcard")
          .eq(1)
          .findByLabelText("Disconnect")
          .click();

        H.saveDashboard();

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
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findAllByTestId("dashcard-container").contains(title).click();

    cy.location("search").should("contain", dashboardFilter.default);
    H.filterWidget().contains("After January 1, 2026");
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
    H.restore();
    cy.signInAsAdmin();

    // In this test we're using already present question ("Orders") and the dashboard with that question ("Orders in a dashboard")
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [dashboardFilter],
    });

    H.createNativeQuestion(questionDetails).then(({ body: { id: SQL_ID } }) => {
      H.updateDashboardCards({
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
    });
  });

  it("should show QB question on a dashboard with filter connected to card without data-permission (metabase#12720)", () => {
    cy.signIn("readonly");

    clickThrough("12720_SQL");
    clickThrough("Orders");
  });

  it("should apply the specific (before|after) filter on a native question with field filter (metabase#47172)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.getDashboardCard(1).within(() => {
      cy.findByText("There was a problem displaying this chart.").should(
        "not.exist",
      );

      cy.log("Drill down to the question");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");
      cy.findByText(questionDetails.name).click();
    });

    cy.location("search").should("eq", `?filter=${dashboardFilter.default}`);
    cy.wait("@cardQuery");
    H.tableInteractive().should("be.visible").and("contain", "97.44");
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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should work for saved nested questions (metabase#12985-1)", () => {
    H.createQuestion({
      name: "Q1",
      query: { "source-table": PRODUCTS_ID },
    }).then(({ body: { id: Q1_ID } }) => {
      // Create nested card based on the first one
      const nestedQuestion = {
        name: "Q2",
        query: { "source-table": `card__${Q1_ID}` },
      };

      H.createQuestionAndDashboard({
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

        H.visitDashboard(dashboard_id);
      });
    });

    H.filterWidget().contains("Category").click();
    cy.log("Failing to show dropdown in v0.36.0 through v.0.37.0");

    H.popover().within(() => {
      cy.findByText("Doohickey");
      cy.findByText("Gizmo");
      cy.findByText("Widget");
      cy.findByText("Gadget").click();
    });
    cy.button("Add filter").click();

    cy.location("search").should("eq", "?category=Gadget");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ergonomic Silk Coat");
  });

  it(
    "should work for aggregated questions (metabase#12985-2)",
    { tags: "@skip" },
    () => {
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

      H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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

          H.visitDashboard(dashboard_id);
        },
      );

      H.filterWidget().contains("Category").click();
      // It will fail at this point until the issue is fixed because popover never appears
      H.popover().contains("Gadget").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filter").click();
      cy.url().should("contain", "?category=Gadget");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Ergonomic Silk Coat");
    },
  );
});

describe("issues 15119 and 16112", () => {
  beforeEach(() => {
    H.restore();
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

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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
        H.visitDashboard(dashboard_id);
        H.editDashboard();
        cy.findByText("Rating Filter").click();
        cy.findByText("Linked filters").click();

        // turn on the toggle
        H.sidebar().findByRole("switch").parent().get("label").click();

        cy.findByText("Save").click();

        cy.signIn("nodata");
        H.visitDashboard(dashboard_id);
      },
    );

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(reviewerFilter.name).click();
    H.popover().contains("adam").click();
    cy.button("Add filter").click();

    cy.findByTestId("dashcard-container").should("contain", "adam");
    cy.location("search").should("eq", "?rating=&reviewer=adam");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ratingFilter.name).click();

    H.popover().contains("5").click();
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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should remove filter value from url after going to another dashboard (metabase#16663)", () => {
    const dashboardToRedirect = "Orders in a dashboard";
    const queryParam = "quarter_and_year=Q1";

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        H.addOrUpdateDashboardCard({
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
        H.visitDashboard(dashboard_id);
      },
    );

    cy.url().should("include", queryParam);

    H.commandPaletteSearch(dashboardToRedirect, false);
    H.commandPalette().within(() => {
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
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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

        H.visitDashboard(dashboard_id);
      },
    );
  });

  it("should not falsely alert that no matching dashboard filter has been found (metabase#17211)", () => {
    H.filterWidget().click();

    cy.findByPlaceholderText("Search the list").type("abb");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Abbeville").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("No matching City found").should("not.exist");
  });
});

describe("issue 17551", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion({
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

      H.createQuestionAndDashboard({
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

        H.editDashboardCard(card, mapFilterToCard);

        H.visitDashboard(dashboard_id);
      });
    });
  });

  it("should include today in the 'All time' date filter when chosen 'Next' (metabase#17551)", () => {
    H.filterWidget().click();
    setAdHocFilter({ condition: "Next", includeCurrent: true });

    cy.url().should("include", "?date_filter=next30days~");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("tomorrow");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id } = dashboardCard;

        const updatedSize = { size_x: 21, size_y: 8 };

        H.editDashboardCard(dashboardCard, updatedSize);

        H.visitDashboard(dashboard_id);
      },
    );

    H.editDashboard();

    // Make sure filter can be connected to the custom column using UI, rather than using API.
    H.filterWidget({ isEditing: true }).click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Column to filter on")
      .parent()
      .parent()
      .within(() => {
        cy.findByText("Select…").click();
      });

    H.popover().within(() => {
      cy.findByText("CC Date").click();
    });

    H.saveDashboard();
  });

  it("should be able to apply dashboard filter to a custom column (metabase#17775)", () => {
    H.filterWidget().click();

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
    H.filterWidget({ isEditing: true })
      .filter(`:contains("${filterName}")`)
      .click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByText("Select…").eq(cardPosition).click();

    H.popover().contains("Category").click();
  }

  function setDefaultFilter(value) {
    cy.findByText("No default").click();

    H.popover().contains(value).click();

    cy.button("Add filter").click();
  }

  function checkAppliedFilter(name, value) {
    cy.findByText(name, { exact: false })
      .closest('[data-testid="parameter-widget"]')
      .contains(value);
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // Add two "Orders" questions to the existing "Orders in a dashboard" dashboard
    H.updateDashboardCards({
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
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();

    connectFilterToCard({ filterName: "Card 1 Filter", cardPosition: 0 });
    setDefaultFilter("Doohickey");

    connectFilterToCard({ filterName: "Card 2 Filter", cardPosition: -1 });
    setDefaultFilter("Gizmo");

    H.saveDashboard();

    checkAppliedFilter("Card 1 Filter", "Doohickey");

    H.getDashboardCard(0).should("contain", "148.23");

    checkAppliedFilter("Card 2 Filter", "Gizmo");

    H.getDashboardCard(1).should("contain", "110.93");
  });
});

describe("issue 16177", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      semantic_type: null,
    });
  });

  it("should not lose the default value of the parameter connected to a field with a coercion strategy applied (metabase#16177)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Date picker", "All Options");
    H.selectDashboardFilter(H.getDashboardCard(), "Quantity");
    H.dashboardParameterSidebar().findByText("No default").click();
    H.popover().findByText("Yesterday").click();
    H.saveDashboard();
    H.filterWidget().findByText("Yesterday").should("be.visible");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.filterWidget().findByText("Yesterday").should("be.visible");
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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow a user to visit a dashboard even without a permission to see the dashboard card (metabase#20656, metabase#24536)", () => {
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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

        H.visitDashboard(dashboard_id);
      },
    );

    // Make sure the filter widget is there
    H.filterWidget();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don't have permission to see this card.");

    // Trying to edit the filter should not show mapping fields and shouldn't break frontend (metabase#24536)
    H.editDashboard();

    H.filterWidget({ isEditing: true }).click();

    H.getDashboardCard().within(() => {
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
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(NATIVE_QUESTION_DETAILS, {
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

    H.createDashboard(DASHBOARD_DETAILS).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      H.addOrUpdateDashboardCard({
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
    cy.get("@questionId").then((questionId) => {
      cy.visit(`/question/${questionId}`);
    });

    cy.findByTestId("native-query-top-bar").findByText("Product ID").click();
    H.popover().contains("Rustic Paper Wallet - 1").should("be.visible");

    // Navigating to another page via JavaScript is faster than using `cy.visit("/dashboard/:dashboard-id")` to load the whole page again.
    H.openNavigationSidebar();
    H.navigationSidebar().findByText("Our analytics").click();
    cy.findByRole("main").findByText(DASHBOARD_DETAILS.name).click();

    H.dashboardParametersContainer().findByText("Product ID").click();
    H.popover().contains("Aerodynamic Bronze Hat - 144").should("be.visible");

    cy.log("The following scenario breaks on 46");
    // Navigating to another page via JavaScript is faster than using `cy.visit("/admin/datamodel")` to load the whole page again.
    H.goToAdmin();
    H.appBar().findByText("Table Metadata").click();
    cy.findByRole("main")
      .findByText("Start by selecting data to model")
      .should("be.visible");
    cy.location("pathname").should(
      "eq",
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}`,
    );
    H.goToMainApp();

    H.openNavigationSidebar();
    H.navigationSidebar().findByText("Our analytics").click();
    cy.findByRole("main").findByText(DASHBOARD_DETAILS.name).click();

    // Assert that the dashboard ID filter values is still showing correctly again.
    H.dashboardParametersContainer().findByText("Product ID").click();
    H.popover().contains("Aerodynamic Bronze Hat - 144").should("be.visible");
  });
});

describe("issue 22482", () => {
  function getFormattedRange(start, end) {
    return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
    H.setFilter("Date picker", "All Options");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();
    H.popover().contains("Created At").eq(0).click();

    H.saveDashboard();

    H.filterWidget().click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Relative date range…").click();
  });

  it("should round relative date range (metabase#22482)", () => {
    cy.findByLabelText("Interval").clear().type(15);
    cy.findByRole("textbox", { name: "Unit" }).click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("months").click();

    const expectedRange = getFormattedRange(
      dayjs().startOf("month").add(-15, "month"),
      dayjs().add(-1, "month").endOf("month"),
    );

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    H.filterWidget().click();
    H.dashboardParametersPopover().within(() => {
      H.fieldValuesCombobox().type("Gizmo");
      cy.button("Add filter").click();
    });

    cy.findAllByText("Gizmo");
    cy.findAllByText("Doohickey").should("not.exist");
  }

  function openFilterSettings() {
    H.filterWidget({ isEditing: true }).click();
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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

        H.visitDashboard(dashboard_id);
      },
    );
  });

  it("should not drop filter connected to a custom column on a second dashboard edit (metabase#22788)", () => {
    addFilterAndAssert();

    H.editDashboard();

    openFilterSettings();

    // Make sure the filter is still connected to the custom column

    H.getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.findByText(ccDisplayName);
    });

    // need to actually change the dashboard to test a real save
    H.sidebar().within(() => {
      cy.findByDisplayValue("Text").clear().type("my filter text");
      cy.button("Done").click();
    });

    H.saveDashboard();

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
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dashboard/**/query").as("getCardQuery");
  });

  it("should not allow to add a filter when all exclude options are selected (metabase#24235)", () => {
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        mapParameterToDashboardCard({ id, card_id, dashboard_id });
        H.visitDashboard(dashboard_id);
      },
    );

    H.filterWidget().contains(parameter.name).click();
    H.popover().within(() => {
      cy.findByText("Exclude…").click();
      cy.findByText("Days of the week…").click();
      cy.findByText("Select all").click();
      cy.findByText("Add filter").click();
    });

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
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
    type: "string/=",
    sectionId: "bar",
  };

  const parameters = [listFilter, searchFilter, corruptedFilter];

  const questionDetails = {
    name: "15279",
    query: { "source-table": PEOPLE_ID, limit: 2 },
  };

  const dashboardDetails = { parameters };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("corrupted dashboard filter should still appear in the UI without breaking other filters (metabase#15279, metabase#24500)", () => {
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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

        H.visitDashboard(dashboard_id);
      },
    );

    cy.log("Make sure the list filter works");
    H.filterWidget().contains("List").click();

    H.dashboardParametersPopover().within(() => {
      cy.findByTextEnsureVisible("Organic").click();
      cy.findByTestId("Organic-filter-value").should("be.checked");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("contain", "Dagmar Fay");

    cy.log("Make sure the search filter works");
    H.filterWidget().contains("Search").click();
    H.dashboardParametersPopover().within(() => {
      cy.findByPlaceholderText("Search the list").type("Lora Cronin");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("not.contain", "Dagmar Fay");

    cy.log("Make sure corrupted filter cannot connect to any field");
    // The corrupted filter is only visible when editing the dashboard
    H.editDashboard();
    H.filterWidget({ name: "unnamed", isEditing: true }).click();
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

    H.saveDashboard();

    cy.log("Make sure the list filter still works");
    H.filterWidget().contains("Organic").click();
    H.dashboardParametersPopover()
      .findByTestId("Organic-filter-value")
      .should("be.checked");

    cy.log("Make sure the search filter still works");
    // reset filter value
    H.filterWidget().contains("Search").parent().icon("close").click();
    cy.findByTestId("dashcard-container")
      .should("contain", "Lora Cronin")
      .and("contain", "Dagmar Fay");

    H.filterWidget().contains("Search").click();
    H.dashboardParametersPopover().within(() => {
      cy.findByPlaceholderText("Search the list").type("Lora Cronin");
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
    return H.createQuestion(questionDetails).then(
      ({ body: { id: card_id } }) => {
        H.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboard_id } }) => {
            H.addOrUpdateDashboardCard({
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
      },
    );
  };

  const throttleFieldValuesRequest = (dashboard_id) => {
    const matcher = {
      method: "GET",
      url: `/api/dashboard/${dashboard_id}/params/${parameterDetails.id}/values`,
      middleware: true,
    };

    cy.intercept(matcher, (req) =>
      req.on("response", (res) => res.setDelay(100)),
    );
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show a loader when loading field values (metabase#25322)", () => {
    createDashboard().then(({ dashboard_id }) => {
      H.visitDashboard(dashboard_id);
      throttleFieldValuesRequest(dashboard_id);
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameterDetails.name).click();
    H.popover().findByTestId("loading-indicator").should("exist");
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
    H.createQuestionAndDashboard({
      questionDetails: question1Details,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      H.createQuestion(question2Details).then(({ body: { id: card_2_id } }) => {
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
      });
      H.visitDashboard(dashboard_id);
    });
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping parameters to combined cards individually (metabase#25248)", () => {
    createDashboard();
    H.editDashboard();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameterDetails.name).click();
    cy.findAllByText("Select…").first().click();
    H.popover().findAllByText("Created At").first().click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders.Created At").should("be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({
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

      H.visitDashboard(dashboard_id);
      cy.wait("@dashcardQuery");
      cy.location("search").should("eq", "?equal_to=");

      H.filterWidget().type("1,2,3{enter}");
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
    H.getDashboardCard(0).findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    H.tableInteractiveHeader("COUNT(*)");
    H.tableInteractiveBody().findByText("3");

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
    H.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Equal to")
      .click();
    H.dashboardParameterSidebar()
      .findByLabelText("Default value")
      .type("1,2,3");

    H.saveDashboard();
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    H.getDashboardCard().findByRole("gridcell").should("have.text", "3");

    cy.button("Clear").click();
    cy.wait("@dashcardQuery");
    H.getDashboardCard().should(
      "contain.text",
      "There was a problem displaying this chart.",
    );
    cy.location("search").should("eq", "?equal_to=");

    cy.button("Reset filter to default state").click();
    cy.wait("@dashcardQuery");
    H.getDashboardCard().findByRole("gridcell").should("have.text", "3");
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");

    // Drill-through and go to the question
    H.getDashboardCard(0).findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    cy.get("[data-testid=cell-data]")
      .should("contain", "COUNT(*)")
      .and("contain", "3");

    cy.location("search").should("eq", "?num=1%2C2%2C3");
  });

  it("should retain comma-separated values when reverting to default via 'Reset all filters' (metabase#25374-4)", () => {
    H.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Equal to")
      .click();
    H.dashboardParameterSidebar()
      .findByLabelText("Default value")
      .type("1,2,3");
    H.saveDashboard();
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    H.getDashboardCard().findByRole("gridcell").should("have.text", "3");

    cy.button("Clear").click();
    cy.wait("@dashcardQuery");
    cy.location("search").should("eq", "?equal_to=");
    H.getDashboardCard().should(
      "contain.text",
      "There was a problem displaying this chart.",
    );

    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Reset all filters").should("be.visible").click();
    cy.wait("@dashcardQuery");
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    cy.location("search").should("eq", "?equal_to=1%2C2%2C3");
    H.getDashboardCard().findByRole("gridcell").should("have.text", "3");

    // Drill-through and go to the question
    H.getDashboardCard(0).findByText(questionDetails.name).click();
    cy.wait("@cardQuery");

    H.tableHeaderColumn("COUNT(*)");
    H.tableInteractiveBody().findByRole("gridcell").should("have.text", "3");

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

    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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
              size_y: 30,
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
        cy.findAllByRole("row").should("have.length", CASE_INSENSITIVE_ROWS);
      },
    );
  });

  it("`contains` dashboard filter should respect case insensitivity on a title-drill-through (metabase#25908)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(questionDetails.name).click();
    cy.wait("@dataset");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Title contains Li");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    H.createDashboard({
      name: "dashboard with a tall card",
      parameters: [FILTER_1],
    }).then(({ body: { id } }) => {
      createDashCard(id, FILTER_1);
      bookmarkDashboard(id);
    });

    H.createDashboard({
      name: "dashboard with a tall card 2",
      parameters: [FILTER_2],
    }).then(({ body: { id } }) => {
      createDashCard(id, FILTER_2);
      bookmarkDashboard(id);
      H.visitDashboard(id);
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
    H.restore();
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
    H.restore();
    cy.signInAsAdmin();

    H.createDashboard(paramDashboard).then(({ body: { id } }) => {
      cy.request("POST", `/api/bookmark/dashboard/${id}`);
    });

    H.createDashboard(regularDashboard).then(({ body: { id } }) => {
      cy.request("POST", `/api/bookmark/dashboard/${id}`);
      H.visitDashboard(id);
    });
  });

  it("should seamlessly move between dashboards with or without filters without triggering an error (metabase#27356)", () => {
    H.openNavigationSidebar();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(paramDashboard.name).click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is empty");

    H.openNavigationSidebar();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(regularDashboard.name).click({ force: true });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is empty");

    H.openNavigationSidebar();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(paramDashboard.name).click({ force: true });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is empty");
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

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [filter],
        });

        H.visitDashboard(dashboard_id, { queryParams: { cat: "Gizmo" } });
      },
    );
  });

  it("filter connected to custom column should visually indicate it is connected (metabase#27768)", () => {
    // We need to manually connect the filter to the custom column using the UI,
    // but when we fix the issue, it should be safe to do this via API
    H.editDashboard();
    H.filterWidget({ isEditing: true, name: filter.name }).click();

    H.getDashboardCard().findByText("Select…").click();
    H.popover().contains("CCategory").click();
    H.saveDashboard();

    H.filterWidget().click();
    H.dashboardParametersPopover().within(() => {
      H.fieldValuesCombobox().type("Gizmo");
      cy.button("Add filter").click();
    });

    cy.findAllByText("Doohickey").should("not.exist");

    // Make sure the filter is still connected to the custom column
    H.editDashboard();
    H.filterWidget({ isEditing: true, name: filter.name }).click();

    H.getDashboardCard().within(() => {
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

  const getRemappedValue = (fieldValue) => {
    return `N${fieldValue}`;
  };

  const addFieldRemapping = (fieldId) => {
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
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
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

  const filterOnRemappedValues = (fieldValue) => {
    H.filterWidget().within(() => {
      cy.findByText(filterDetails.name).click();
    });

    H.popover().within(() => {
      cy.findByText(getRemappedValue(fieldValue)).click();
      cy.button("Add filter").click();
    });
  };

  const verifyRemappedValues = (fieldValue) => {
    verifyRemappedFilterValues(filterValue);
    verifyRemappedCardValues(fieldValue);
  };

  const verifyRemappedFilterValues = (fieldValue) => {
    H.filterWidget().within(() => {
      cy.findByText(getRemappedValue(fieldValue)).should("be.visible");
    });
  };

  const verifyRemappedCardValues = (fieldValue) => {
    H.getDashboardCard().within(() => {
      cy.findAllByText(getRemappedValue(fieldValue)).should("have.length", 2);
    });
  };

  beforeEach(() => {
    H.restore();
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
      H.visitDashboard("@dashboardId");
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      H.visitDashboard("@dashboardId", {
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
      cy.get("@dashboardId").then((dashboardId) =>
        H.visitEmbeddedPage({
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
      cy.get("@dashboardId").then((dashboardId) => {
        H.visitEmbeddedPage({
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
      cy.get("@dashboardId").then((dashboardId) => {
        H.visitEmbeddedPage(
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
      cy.get("@dashboardId").then((dashboardId) =>
        H.visitPublicDashboard(dashboardId),
      );
      cy.wait("@dashboard");
      cy.wait("@cardQuery");

      filterOnRemappedValues(filterValue);
      cy.wait("@cardQuery");

      verifyRemappedValues(filterValue);
    });

    it("should be able to filter on remapped values in the url (metabase#29347, metabase#29346)", () => {
      createDashboard();
      cy.get("@dashboardId").then((dashboardId) => {
        H.visitPublicDashboard(dashboardId, {
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
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("/api/dashboard/*").as("dashboard");
  });

  it("should allow setting default values for a not connected between filter (metabase#31662)", () => {
    H.createDashboard(dashboardDetails).then(
      ({ body: { id: dashboardId } }) => {
        cy.visit(`dashboard/${dashboardId}?between=10&between=20`);
        cy.wait("@dashboard");
      },
    );
    cy.findByTestId("dashboard-empty-state").should("be.visible");
    H.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Between")
      .click();
    H.sidebar().findByText("2 selections").click();
    H.popover().within(() => {
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
    H.selectDashboardFilter(dashcardElement, columnName);
    H.sidebar().button("Done").click();
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
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not make a request to the server if the parameters are not saved (metabase#38245)", () => {
    H.createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [DASHBOARD_TEXT_FILTER],
      dashcards: [],
    }).then((dashboard) => H.visitDashboard(dashboard.id));

    H.editDashboard();
    H.openQuestionsSidebar();

    H.sidebar().findByText("Orders").click();

    cy.wait("@cardQuery");

    mapDashCardToFilter(
      H.getDashboardCard(),
      DASHBOARD_TEXT_FILTER.name,
      "Source",
    );

    H.goToTab(TAB_2.name);
    H.goToTab(TAB_1.name);

    H.getDashboardCard().within(() => {
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

  const questionDetails = (modelId) => ({
    name: "Question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });

  const questionWithAggregationDetails = (modelId) => ({
    name: "Question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
      aggregation: [["count"]],
    },
  });

  function verifyNestedFilter(questionDetails) {
    H.createQuestion(modelDetails).then(({ body: model }) => {
      H.createDashboardWithQuestions({
        questions: [questionDetails(model.id)],
      }).then(({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      });
    });

    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.getDashboardCard().findByText("Select…").click();
    H.popover().findByText("People - User → Source").click();
    H.saveDashboard();

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Twitter").click();
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    H.restore();
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

  const getQuestionDetails = (modelId) => ({
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

  const getParameterMapping = (questionId) => ({
    parameter_id: parameterDetails.id,
    card_id: questionId,
    target: ["dimension", ["field", "STATE", { "base-type": "type/Text" }]],
  });

  function filterAndVerifyResults() {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("AK").click();
      cy.findByText("AR").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().findByTestId("scalar-value").should("have.text", "2");
  }

  function drillAndVerifyResults() {
    H.getDashboardCard().findByText("SQL model-based question").click();
    cy.findByTestId("qb-filters-panel").findByText("State is 2 selections");
    cy.findByTestId("scalar-value").should("have.text", "2");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(modelDetails).then(({ body: model }) => {
      // populate result_metadata
      cy.request("POST", `/api/card/${model.id}/query`);
      H.setModelMetadata(model.id, (field) => {
        if (field.display_name === "STATE") {
          return { ...field, ...stateFieldDetails };
        }
        return field;
      });
      H.createDashboardWithQuestions({
        dashboardDetails,
        questions: [getQuestionDetails(model.id)],
      }).then(({ dashboard, questions: [question] }) => {
        H.updateDashboardCards({
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
    H.visitDashboard("@dashboardId");
    filterAndVerifyResults();
    drillAndVerifyResults();
  });

  it("should be able to get field values coming from a sql model-based question in a public dashboard (metabase#42829)", () => {
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitPublicDashboard(dashboardId),
    );
    filterAndVerifyResults();
  });

  it("should be able to get field values coming from a sql model-based question in a embedded dashboard (metabase#42829)", () => {
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitEmbeddedPage({
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
    H.createDashboardWithQuestions({ questions: [modelDetails] }).then(
      ({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      },
    );
    H.editDashboard();
    cy.findByTestId("dashboard-header")
      .findByLabelText("Add a filter or parameter")
      .click();
    H.popover().findByText("Text or Category").click();
    H.getDashboardCard().findByText("Select…").click();
    H.popover().findByText("People - User → Source").click();
    H.saveDashboard();
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Google").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().findByText("43799").click();
    cy.findByTestId("qb-filters-panel")
      .findByText("People - User → Source is Google")
      .should("be.visible");
    H.assertQueryBuilderRowCount(4);
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
    H.getDashboardCard(0).within(() => {
      cy.findByText(/Category/i).should("be.visible");
    });
    H.getDashboardCard(1).within(() => {
      cy.findByText(/Category/i).should("not.exist");
      cy.findByText(/Models are data sources/).should("be.visible");
    });
  }

  function verifyFilter() {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard(0).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findByText("Doohickey").should("not.exist");
    });
    H.getDashboardCard(1).within(() => {
      cy.findAllByText("Gadget").should("have.length.gte", 1);
      cy.findAllByText("Doohickey").should("have.length.gte", 1);
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion(questionDetails).then(({ body: question }) => {
      H.createNativeQuestion(modelDetails).then(({ body: model }) => {
        H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
          H.updateDashboardCards(
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
    H.visitDashboard("@dashboardId");
    H.editDashboard();
    verifyMapping();
    H.saveDashboard({ awaitRequest: false });
    verifyFilter();
    cy.signOut();

    cy.log("public dashboards");
    cy.signInAsAdmin();
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitPublicDashboard(dashboardId),
    );
    verifyFilter();

    cy.log("embedded dashboards");
    cy.get("@dashboardId").then((dashboardId) =>
      H.visitEmbeddedPage({
        resource: { dashboard: dashboardId },
        params: {},
      }),
    );
    verifyFilter();
  });
});

describe("issue 27579", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to remove the last exclude hour option (metabase#27579)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Date picker", "All Options");
    H.selectDashboardFilter(H.getDashboardCard(), "Created At");
    H.saveDashboard();
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Exclude…").click();
      cy.findByText("Hours of the day…").click();
      cy.findByText("Select all").click();
      cy.findByLabelText("12 AM").should("be.checked");

      cy.findByText("Select all").click();
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

  const getQuestion2Details = (card) => ({
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

  const getParameterMapping = (card) => ({
    card_id: card.id,
    parameter_id: parameterDetails.id,
    target: [
      "dimension",
      ["field", PRODUCTS.RATING, { "base-type": "type/Integer" }],
    ],
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should retain source query filters when drilling-thru from a dashboard (metabase#32804)", () => {
    H.createQuestion(question1Details).then(({ body: card1 }) => {
      H.createDashboardWithQuestions({
        dashboardDetails,
        questions: [getQuestion2Details(card1)],
      }).then(({ dashboard, questions: [card2] }) => {
        H.updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: card2.id,
              parameter_mappings: [getParameterMapping(card2)],
            },
          ],
        });
        H.visitDashboard(dashboard.id, {
          params: { [parameterDetails.slug]: "4" },
        });
      });
    });
    H.filterWidget().findByText("4").should("be.visible");
    H.getDashboardCard(0).findByText("Q2").click();
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

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText(productName).click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard(0).findByText(productName).should("be.visible");
    H.getDashboardCard(1)
      .findAllByText(String(productId))
      .should("have.length.above", 0);
  }

  function verifyFieldMapping(type) {
    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [getPkCardDetails(type), getFkCardDetails(type)],
    }).then(({ dashboard, questions: [pkCard, fkCard] }) => {
      H.updateDashboardCards(
        getDashcardDetails(type, dashboard, pkCard, fkCard),
      );

      H.visitDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      H.visitPublicDashboard(dashboard.id);
      verifyFilterByRemappedValue();

      H.visitEmbeddedPage({
        resource: { dashboard: dashboard.id },
        params: {},
      });
      verifyFilterByRemappedValue();
    });
  }

  beforeEach(() => {
    H.restore();
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
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
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
          target: [
            "dimension",
            ["field", "RATING", { "base-type": "type/Integer" }],
          ],
        },
      ],
    };
  }

  function verifyFilterWithRemapping() {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").type("Remapped");
      cy.findByText("Remapped").click();
      cy.button("Add filter").click();
    });
  }

  beforeEach(() => {
    H.restore();
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
    H.createQuestion(sourceQuestionDetails);
    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails, modelDetails],
    }).then(({ dashboard, questions: cards }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          getQuestionDashcardDetails(dashboard, cards[0]),
          getModelDashcardDetails(dashboard, cards[1]),
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.log("verify filtering works in a regular dashboard");
    H.visitDashboard("@dashboardId");
    verifyFilterWithRemapping();

    cy.log("verify filtering works in a public dashboard");
    cy.get("@dashboardId").then(H.visitPublicDashboard);
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
    return H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions: [card] }) => {
      H.addOrUpdateDashboardCard({
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
    H.filterWidget().findByText("Tressa White").should("be.visible");
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${PEOPLE.ID}`, {
      has_field_values: "list",
    });
  });

  it("should remap initial parameter values in public dashboards (metabase#45659)", () => {
    createDashboard().then(({ dashboard }) =>
      H.visitPublicDashboard(dashboard.id),
    );
    verifyFilterWithRemapping();
  });

  it("should remap initial parameter values in embedded dashboards (metabase#45659)", () => {
    createDashboard().then(({ dashboard }) =>
      H.visitEmbeddedPage({
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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow mapping when native and regular questions can be mapped (metabase#44266)", () => {
    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [regularQuestion, nativeQuestion],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
      H.editDashboard();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Equal to")
        .click();

      H.getDashboardCard(1).findByText("Select…").click();

      H.popover().findByText("Price").click();

      H.getDashboardCard(1).findByText("Price").should("be.visible");
    });
  });
});

describe("issue 44790", () => {
  beforeEach(() => {
    H.restore();
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

    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [idFilter, numberFilter],
      },
      questions: [peopleQuestionDetails],
    }).then(({ dashboard, questions: cards }) => {
      const [peopleCard] = cards;

      cy.wrap(dashboard.id).as("dashboardId");

      H.updateDashboardCards({
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
    H.visitDashboard("@dashboardId", {
      params: {
        [idFilter.slug]: "{{test}}",
      },
    });
    H.getDashboardCard().should("contain", "borer-hudson@yahoo.com");

    cy.log("wrong value for number filter should be ignored");
    H.visitDashboard("@dashboardId", {
      params: {
        [numberFilter.slug]: "{{test}}",
        [idFilter.slug]: "1",
      },
    });
    H.getDashboardCard().should("contain", "borer-hudson@yahoo.com");
  });
});

describe("issue 34955", () => {
  function checkAppliedFilter(name, value) {
    cy.contains('[data-testid="parameter-widget"]', name, {
      exact: false,
    }).contains(value);
  }

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
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails,
      cardDetails: {
        size_x: 16,
        size_y: 8,
      },
    }).then(({ body: { dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");

      H.visitDashboard(dashboard_id);
      H.editDashboard();

      H.setFilter("Date picker", "Single Date", "On");
      connectFilterToColumn(ccName);

      H.setFilter("Date picker", "Date Range", "Between");
      connectFilterToColumn(ccName);

      H.saveDashboard();

      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByRole("columnheader").eq(-2).should("have.text", "Created At");
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByRole("columnheader").eq(-1).should("have.text", ccName);
      H.tableInteractiveBody()
        .findAllByRole("gridcell")
        .filter(":contains(May 15, 2024, 8:04 AM)")
        .should("have.length", 2);
    });
  });

  it("should connect specific date filter (`Between`) to the temporal custom column (metabase#34955)", () => {
    cy.get("@dashboardId").then((dashboard_id) => {
      // Apply filter through URL to prevent the typing flakes
      cy.visit(`/dashboard/${dashboard_id}?on=&between=2024-01-01~2024-03-01`);
      checkAppliedFilter("Between", "January 1, 2024 - March 1, 2024");

      cy.findAllByTestId("cell-data")
        .filter(":contains(January 1, 2024, 7:26 AM)")
        .should("have.length", 2);
    });

    cy.get("@dashboardId").then((dashboard_id) => {
      // Apply filter through URL to prevent the typing flakes
      cy.visit(`/dashboard/${dashboard_id}?on=2024-01-01&between=`);
      checkAppliedFilter("On", "January 1, 2024");

      cy.findAllByTestId("cell-data")
        .filter(":contains(January 1, 2024, 7:26 AM)")
        .should("have.length", 2);
    });
  });

  function connectFilterToColumn(column) {
    H.getDashboardCard().within(() => {
      cy.findByText("Column to filter on");
      cy.findByText("Select…").click();
    });

    H.popover().within(() => {
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
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show filter values for a model based on sql query (metabase#35852)", () => {
    H.createNativeQuestion(model).then(({ body: { id: modelId } }) => {
      H.setModelMetadata(modelId, (field) => {
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
      H.visitModel(modelId);
    });

    H.tableHeaderClick("Category");
    H.popover().findByText("Filter by this column").click();

    cy.log("Verify filter values are available");

    H.popover()
      .should("contain", "Gizmo")
      .should("contain", "Doohickey")
      .should("contain", "Gadget")
      .should("contain", "Widget");

    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.log("Verify filter is applied");

    cy.findAllByTestId("cell-data")
      .filter(":contains(Gizmo)")
      .should("have.length", 2);

    H.visitDashboard("@dashboardId");

    H.filterWidget().click();

    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    H.getDashboardCard().findAllByText("Gizmo").should("have.length", 2);
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

    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions: [card] }) => {
      cy.wrap(dashboard.id).as("dashboardId");

      H.updateDashboardCards({
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

describe("issue 47097", () => {
  const questionDetails = {
    name: "Products",
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  const parameterDetails = {
    id: "49596bcb-62bb-49d6-a92d-bf5dbfddf43b",
    type: "string/=",
    name: "Category",
    slug: "category",
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it('should be able to use filters without "create-queries" permissions when coming from a dashboard (metabase#47097)', () => {
    cy.log("create a dashboard with a parameter mapped to a field with values");
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        H.updateDashboardCards({
          dashboard_id,
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 12,
              size_y: 12,
              parameter_mappings: [
                {
                  parameter_id: parameterDetails.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        });
        cy.wrap(dashboard_id).as("dashboardId");
      },
    );

    cy.log("verify the field values in a dashboard");
    cy.signIn("nodata");
    H.visitDashboard("@dashboardId");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").should("be.visible");
      cy.findByPlaceholderText("Search the list").type("{esc}");
    });

    cy.log("drill-thru without filter values and check the dropdown");
    H.getDashboardCard().findByText("Products").click();
    H.queryBuilderHeader().should("be.visible");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").should("be.visible");
      cy.findByPlaceholderText("Search the list").type("{esc}");
    });
    H.queryBuilderHeader().findByLabelText("Back to Dashboard").click();
    H.getDashboardCard().should("be.visible");

    cy.log("add a filter value, drill-thru, and check the dropdown");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().findByText("Products").click();
    H.queryBuilderHeader().should("be.visible");
    H.filterWidget().click();
    H.popover().findByText("Widget").should("be.visible");
  });
});

describe("issue 48524", () => {
  const questionDetails = {
    name: "15119",
    query: { "source-table": REVIEWS_ID },
  };

  const ratingFilter = {
    id: "5dfco74e",
    slug: "rating",
    name: "Rating",
    type: "string/=",
    sectionId: "string",
  };

  const reviewerFilter = {
    id: "ad1c877e",
    name: "Reviewer",
    slug: "reviewer",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = { parameters: [reviewerFilter, ratingFilter] };

  function createDashboard() {
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        H.updateDashboardCards({
          dashboard_id,
          cards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 12,
              size_y: 8,
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
        cy.wrap(dashboard_id).as("dashboardId");
      },
    );
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not apply last used parameter values when some parameters have values set in the URL (metabase#48524)", () => {
    createDashboard();

    cy.log(
      "open the dashboard with 2 parameters to populate their last used values",
    );
    H.visitDashboard("@dashboardId", {
      params: {
        [reviewerFilter.slug]: ["abbey-heidenreich"],
        [ratingFilter.slug]: 4,
      },
    });
    H.assertTableRowsCount(1);

    cy.log(
      "open the dashboard again and verify that the last used values are applied",
    );
    H.visitDashboard("@dashboardId");
    H.assertTableRowsCount(1);

    cy.log(
      "open the dashboard with only 1 parameter value and verify that the last used values are not applied in this case",
    );
    H.visitDashboard("@dashboardId", {
      params: {
        [ratingFilter.slug]: 4,
      },
    });
    H.assertTableRowsCount(535);
  });
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
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not crash a dashboard when there is a missing parameter column (metabase#32573)", () => {
    H.createQuestion(modelDetails).then(({ body: model }) => {
      H.createQuestion(getQuestionDetails(model.id)).then(
        ({ body: question }) => {
          H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
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
              .then(() => H.visitDashboard(dashboard.id));
          });
        },
      );
    });
    H.getDashboardCard()
      .findByText("There was a problem displaying this chart.")
      .should("be.visible");

    H.editDashboard();
    cy.findByTestId("fixed-width-filters").findByText("ID").click();
    H.getDashboardCard().within(() => {
      cy.findByText("Unknown Field").should("be.visible");
      cy.findByLabelText("Disconnect").click();
    });
    H.saveDashboard();
    H.getDashboardCard().within(() => {
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
      const table = tables.find((table) => table.name === tableName);
      return cy
        .request("GET", `/api/table/${table.id}/query_metadata`)
        .then(({ body: metadata }) => {
          const { fields } = metadata;
          return fields.find((field) => field.name === "boolean");
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
    H.restore(`${dialect}-writable`);
    H.resetTestTable({ type: dialect, table: tableName });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName });
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should be able to pass query string parameters for boolean parameters in dashboards (metabase#45670)", () => {
    getField().then((field) => {
      H.createNativeQuestion(getQuestionDetails(field.id)).then(
        ({ body: card }) => {
          H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
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
            H.visitDashboard(dashboard.id, {
              params: {
                [parameterDetails.slug]: "true",
              },
            });
          });
        },
      );
    });
    H.filterWidget().should("contain.text", "true");
    H.getDashboardCard().within(() => {
      cy.findByText("true").should("be.visible");
      cy.findByText("false").should("not.exist");
    });
  });
});

describe("issue 48351", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should navigate to the specified tab with click behaviors (metabase#48351)", () => {
    H.createDashboardWithTabs({
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
    }).then((dashboard1) => {
      H.createDashboardWithTabs({
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
      }).then((dashboard2) => H.visitDashboard(dashboard2.id));
    });
    H.goToTab("Tab 4");
    H.getDashboardCard().within(() =>
      cy.findAllByRole("gridcell").eq(0).click(),
    );
    cy.findByTestId("dashboard-name-heading").should(
      "have.value",
      "Dashboard 1",
    );
    H.assertTabSelected("Tab 2");
  });
});

describe("issue 52484", () => {
  const questionDetails = {
    native: {
      query: "SELECT ID, RATING FROM PRODUCTS [[WHERE RATING = {{rating}}]]",
      "template-tags": {
        rating: {
          id: "56708d23-6f01-42b7-98ed-f930295d31b9",
          name: "rating",
          type: "number",
          "display-name": "Rating",
        },
      },
    },
    parameters: [
      {
        id: "56708d23-6f01-42b7-98ed-f930295d31b9",
        name: "Rating",
        slug: "rating",
        type: "number/=",
        target: ["dimension", ["template-tag", "rating"]],
      },
    ],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to use click behaviors with numeric columns that are not database fields (metabase#52484)", () => {
    H.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    cy.log("setup a dashboard with a click behavior");
    H.editDashboard();
    H.setFilter("Number", "Equal to");
    H.selectDashboardFilter(H.getDashboardCard(), "Rating");
    H.dashboardParametersDoneButton().click();
    H.showDashboardCardActions();
    cy.findByLabelText("Click behavior").click();
    H.sidebar().within(() => {
      cy.findByText("ID").click();
      cy.findByText("Update a dashboard filter").click();
      cy.findByText("Number").click();
    });
    H.popover().findByText("ID").click();
    H.saveDashboard();

    cy.log("update a dashboard filter by clicking on a ID column value");
    H.getDashboardCard().findByText("2").click();
    H.filterWidget().findByDisplayValue("2").should("be.visible");

    cy.log("verify query results for the new filter");
    H.getDashboardCard().within(() => {
      cy.findByText("27").should("be.visible");
      cy.findByText("123").should("be.visible");
    });
  });
});

describe("issue 40396", { tags: "@external " }, () => {
  const tableName = "many_data_types";

  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: tableName });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("should be possible to use dashboard filters with native enum fields (metabase#40396)", () => {
    cy.log("create a dashboard with a question with a type/Enum field");
    cy.request("GET", "/api/table").then(({ body: tables }) => {
      const table = tables.find((table) => table.name === tableName);
      cy.request("GET", `/api/table/${table.id}/query_metadata`).then(
        ({ body: metadata }) => {
          const field = metadata.fields.find((field) => field.name === "enum");
          cy.request("PUT", `/api/field/${field.id}`, {
            semantic_type: "type/Enum",
          });

          H.createQuestionAndDashboard({
            questionDetails: {
              database: table.db_id,
              query: { "source-table": table.id },
            },
          }).then(({ body: { dashboard_id } }) => {
            H.visitDashboard(dashboard_id);
            cy.wait("@dashcardQuery");
          });
        },
      );
    });

    cy.log("verify that a enum field can be mapped to a parameter");
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Enum");
    H.saveDashboard();

    cy.log("verify that filtering on a enum field works");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("beta").click();
      cy.button("Add filter").click();
    });
    cy.wait("@dashcardQuery");
    H.tableInteractiveScrollContainer().scrollTo("right");
    H.getDashboardCard().findAllByText("beta").should("have.length.gte", 1);
  });
});

describe("issue 52627", () => {
  const questionDetails = {
    display: "bar",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["avg", ["field", ORDERS.TOTAL, null]],
        ["avg", ["field", ORDERS.DISCOUNT, null]],
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };

  const parameterDetails = {
    name: "Category",
    slug: "category",
    id: "b6ed2d71",
    type: "string/=",
    sectionId: "string",
    default: ["Gadget"],
  };

  const parameterTarget = [
    "dimension",
    ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    { "stage-number": 0 },
  ];

  const dashboardDetails = {
    parameters: [parameterDetails],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should remove an empty query stage after a dashboard drill-thru (metabase#52627)", () => {
    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        H.addOrUpdateDashboardCard({
          dashboard_id,
          card_id,
          card: {
            id,
            parameter_mappings: [
              {
                card_id: card_id,
                parameter_id: parameterDetails.id,
                target: parameterTarget,
              },
            ],
          },
        });
        H.visitDashboard(dashboard_id);
      },
    );
    H.chartPathWithFillColor("#A989C5").first().click();
    H.popover().findByText("See this month by week").click();
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel").findByText(
      "Product → Category is Gadget",
    );
    H.summarize();
    H.rightSidebar().findByText("Average of Total").should("be.visible");
  });
});

describe("issue 52918", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should re-position the parameter dropdown when its size changes (metabase#52918)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Date picker", "All Options");
    H.sidebar().findByLabelText("No default").click();
    H.popover().within(() => {
      cy.findByText("Fixed date range…").click();
      cy.findByText("Between").should("be.visible");
    });
    cy.log("check that there is no overflow in the popover");
    H.popover().should(([element]) => {
      expect(element.offsetWidth).to.gte(element.scrollWidth);
    });
  });
});

describe("issue 54236", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.clock(new Date("2025-02-26"));
  });

  it("should show correct date range in the date picker (metabase#54236)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.setFilter("Date picker", "All Options");
    H.sidebar().findByLabelText("No default").click();
    H.popover().within(() => {
      cy.findByText("Relative date range…").click();
      cy.findByText("Next").click();
      cy.findByDisplayValue("30").clear().type("1");
      cy.findAllByDisplayValue("day").filter(":visible").click();
    });
    H.popover().should("have.length", 2).last().findByText("quarter").click();
    H.popover().within(() => {
      cy.icon("arrow_left_to_line").click();
      cy.findByDisplayValue("4").clear().type("1");
      cy.findByText("Jul 1 – Sep 30, 2025").should("be.visible");
      cy.findByText("Apr 1 – Jun 30, 2025").should("not.exist");
    });
  });
});

describe("issue 17061", () => {
  const questionDetails = {
    query: {
      "source-table": PEOPLE_ID,
      "order-by": [["asc", ["field", PEOPLE.ID, null]]],
      limit: 1,
    },
  };

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

  const getParameterMapping = (cardId) => ({
    parameter_id: parameterDetails.id,
    card_id: cardId,
    target: ["dimension", ["field", "STATE", { "base-type": "type/Text" }]],
  });

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/public/dashboard/*/dashcard/*/card/*").as(
      "publicDashcardData",
    );
  });

  it("should not send multiple query requests for the same dashcards when opening a public dashboard with parameters (metabase#17061)", () => {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: dashcard, questionId }) => {
      H.updateDashboardCards({
        dashboard_id: dashcard.dashboard_id,
        cards: [
          {
            card_id: questionId,
            parameter_mappings: [getParameterMapping(questionId)],
          },
        ],
      });
      H.visitPublicDashboard(dashcard.dashboard_id);
    });

    H.getDashboardCard().findByText("1").should("be.visible");
    cy.get("@publicDashcardData.all").should("have.length", 1);
  });
});

// TODO ranquild unskip after v54 release
describe("issue 48824", { tags: "@skip" }, () => {
  const dateParameter = {
    id: "abc",
    name: "Date filter",
    slug: "filter-date",
    type: "date/all-options",
    default: "past30days-from-7days",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should correctly translate relative filters in dashboards (metabase#48824)", () => {
    cy.log("set locale");
    cy.request("GET", "/api/user/current").then(({ body: user }) => {
      cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
    });

    cy.log("add a date parameter with a relative default value to a dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [dateParameter],
    });
    H.updateDashboardCards({
      dashboard_id: ORDERS_DASHBOARD_ID,
      cards: [
        {
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              card_id: ORDERS_QUESTION_ID,
              parameter_id: dateParameter.id,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ],
        },
      ],
    });

    cy.log("check translations");
    H.visitDashboard(ORDERS_DASHBOARD_ID, {
      params: { [dateParameter.slug]: "past30days" },
    });

    cy.log("Previous 30 days");
    H.filterWidget().findByText("Vorheriger 30 Tage").should("be.visible");
    H.filterWidget().icon("revert").click();

    cy.log("Previous 30 days, starting 7 days ago");
    H.filterWidget()
      .findByText("Vorheriger 30 Tage, ab vor 7 tage")
      .should("be.visible");
  });
});

describe("issue 62627", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  function toggleLinkedFilter(parameterName) {
    cy.button(parameterName)
      .parent()
      .findByRole("switch")
      .click({ force: true });
  }

  it("should properly link inline parameters (metabase#62627)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    cy.log("add a top-level filter");
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Vendor");
    H.setDashboardParameterName("Vendor");
    H.dashboardParameterSidebar().button("Done").click();

    cy.log("add an inline card filter");
    H.showDashboardCardActions();
    H.getDashboardCard()
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Add a filter")
      .click();
    H.popover().findByText("Text or Category").click();
    H.selectDashboardFilter(H.getDashboardCard(), "Category");
    H.setDashboardParameterName("Category");
    H.dashboardParameterSidebar().within(() => {
      cy.findByText("Linked filters").click();
      toggleLinkedFilter("Vendor");
    });
    H.saveDashboard();

    cy.log(
      "verify that the inline parameter is linked to the top-level parameter",
    );
    H.dashboardParametersContainer().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Balistreri-Muller").click();
      cy.button("Add filter").click();
    });
    H.getDashboardCard().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Widget").should("be.visible");
      cy.findByText("Gadget").should("not.exist");
    });

    cy.log("make the top-level parameter be linked to the inline parameter");
    H.editDashboard();
    H.getDashboardCard().findByTestId("editing-parameter-widget").click();
    H.dashboardParameterSidebar().within(() => {
      cy.findByText("Linked filters").click();
      toggleLinkedFilter("Vendor");
    });
    H.editingDashboardParametersContainer()
      .findByTestId("editing-parameter-widget")
      .click();
    H.dashboardParameterSidebar().within(() => {
      cy.findByText("Linked filters").click();
      toggleLinkedFilter("Category");
    });
    H.saveDashboard();

    cy.log(
      "verify that the top-level parameter is linked to the inline parameter",
    );
    H.dashboardParametersContainer().within(() =>
      H.filterWidget().icon("close").click(),
    );
    H.getDashboardCard().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.dashboardParametersContainer().within(() => H.filterWidget().click());
    H.popover().within(() => {
      cy.findByText("Barrows-Johns").should("be.visible");
      cy.findByText("Americo Sipes and Sons").should("not.exist");
    });
  });
});

describe("issue 55678", () => {
  const parameterDetails = {
    name: "date",
    slug: "date",
    id: "f8ec7c71",
    type: "date/all-options",
    sectionId: "date",
    default: "2020-01-01~2024-12-31",
  };

  const questionDetails = {
    name: "Orders",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
    display: "line",
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  function setupDashboard() {
    return H.createQuestion(questionDetails).then(
      ({ body: { id: card_id } }) => {
        H.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboard_id } }) => {
            H.addOrUpdateDashboardCard({
              dashboard_id,
              card_id,
              card: {
                parameter_mappings: [
                  {
                    card_id,
                    parameter_id: parameterDetails.id,
                    target: [
                      "dimension",
                      ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
                      { "stage-number": 1 },
                    ],
                  },
                ],
              },
            });
            H.visitDashboard(dashboard_id);
          },
        );
      },
    );
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should ignore parameters mapped to post-aggregation stages when doing query drills (metabase#55678)", () => {
    setupDashboard();
    H.getDashboardCard().within(() => {
      H.cartesianChartCircle().first().click();
    });
    H.popover().findByText("See this Order").click();
    H.queryBuilderFiltersPanel()
      .findByText("Created At: Month is Apr 1–30, 2022")
      .should("be.visible");
    H.assertQueryBuilderRowCount(1);
  });
});

describe("issue 14595", () => {
  const dialect = "postgres";
  const tableName = "many_data_types";

  function createDashboard() {
    return H.getTableId({ name: tableName }).then((tableId) => {
      return H.createDashboardWithQuestions({
        dashboardDetails: {
          parameters: [
            createMockParameter({
              id: "p1",
              slug: "p1",
              name: "p1",
              type: "string/=",
              sectionId: "string",
            }),
            createMockParameter({
              id: "p2",
              slug: "p2",
              name: "p2",
              type: "string/=",
              sectionId: "string",
            }),
            createMockParameter({
              id: "p3",
              slug: "p3",
              name: "p3",
              type: "string/=",
              sectionId: "string",
            }),
          ],
        },
        questions: [
          {
            name: "Orders",
            query: { "source-table": ORDERS_ID },
          },
          {
            name: "Products",
            query: { "source-table": PRODUCTS_ID },
          },
          {
            name: "Many data types",
            database: WRITABLE_DB_ID,
            query: { "source-table": tableId },
          },
        ],
      }).then(({ dashboard }) => {
        return dashboard.id;
      });
    });
  }

  function mapParameters() {
    cy.findByTestId("fixed-width-filters").findByText("p1").click();
    H.selectDashboardFilter(H.getDashboardCard(0), "Source");
    cy.findByTestId("fixed-width-filters").findByText("p2").click();
    H.selectDashboardFilter(H.getDashboardCard(1), "Category");
    cy.findByTestId("fixed-width-filters").findByText("p3").click();
    H.selectDashboardFilter(H.getDashboardCard(2), "String");
  }

  function assertLinkedFilterSettings({
    parameterName,
    compatibleParameterNames,
    incompatibleParameterNames,
  }) {
    cy.findByTestId("fixed-width-filters").findByText(parameterName).click();
    H.sidebar().within(() => {
      cy.findByText("Linked filters").click();
      compatibleParameterNames.forEach((compatibleParameterName) => {
        cy.findByTestId("compatible-parameters")
          .findByText(compatibleParameterName)
          .should("be.visible");
      });
      incompatibleParameterNames.forEach((incompatibleParameterName) => {
        cy.findByTestId("incompatible-parameters")
          .findByText(incompatibleParameterName)
          .should("be.visible");
      });
    });
  }

  function assertParameterSettings() {
    assertLinkedFilterSettings({
      parameterName: "p1",
      compatibleParameterNames: ["p2"],
      incompatibleParameterNames: ["p3"],
    });
    assertLinkedFilterSettings({
      parameterName: "p2",
      compatibleParameterNames: ["p1"],
      incompatibleParameterNames: ["p3"],
    });
    assertLinkedFilterSettings({
      parameterName: "p3",
      compatibleParameterNames: [],
      incompatibleParameterNames: ["p1", "p2"],
    });
  }

  beforeEach(() => {
    H.restore(`${dialect}-writable`);
    H.resetTestTable({ type: dialect, table: tableName });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName });
  });

  it("should not see parameters that cannot be linked to the current parameter in parameter settings (metabase#14595)", () => {
    createDashboard().then((dashboardId) => H.visitDashboard(dashboardId));
    H.editDashboard();
    mapParameters();
    assertParameterSettings();
  });
});

describe("issue 44090", () => {
  const parameterDetails = {
    name: "p1",
    slug: "string",
    id: "f8ec7c71",
    type: "string/=",
  };

  const questionDetails = {
    name: "Orders",
    query: {
      "source-table": REVIEWS_ID,
    },
  };

  const dashboardDetails = {
    name: "Dashboard",
    parameters: [parameterDetails],
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(questionDetails).then(({ body: { id: card_id } }) => {
      H.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboard_id } }) => {
          H.addOrUpdateDashboardCard({
            dashboard_id,
            card_id,
            card: {
              parameter_mappings: [
                {
                  card_id,
                  parameter_id: parameterDetails.id,
                  target: ["dimension", ["field", REVIEWS.BODY, {}]],
                },
              ],
            },
          });
          H.visitDashboard(dashboard_id);
        },
      );
    });
  });

  it("should not overflow the dashboard header when a filter contains a long value that contains spaces (metabase#44090)", () => {
    const LONG_VALUE =
      "Minima non hic doloribus ipsa dolore ratione in numquam. Minima eos vel harum velit. Consequatur consequuntur culpa sed eum";

    H.filterWidget().click();
    H.popover()
      .first()
      .within(() => {
        cy.findByPlaceholderText("Search the list").type(LONG_VALUE);
        cy.button("Add filter").click();
      });

    H.filterWidget().then(($el) => {
      const { width } = $el[0].getBoundingClientRect();
      cy.wrap(width).should("be.lt", 300);
    });
  });

  it("should not overflow the dashboard header when a filter contains a long value that does not contain spaces (metabase#44090)", () => {
    const LONG_VALUE =
      "MinimanonhicdoloribusipsadolorerationeinnumquamMinimaeosvelharumvelitConsequaturconsequunturculpasedeum";

    H.filterWidget().click();
    H.popover()
      .first()
      .within(() => {
        cy.findByPlaceholderText("Search the list").type(LONG_VALUE);
        cy.button("Add filter").click();
      });

    H.filterWidget().then(($el) => {
      const { width } = $el[0].getBoundingClientRect();
      cy.wrap(width).should("be.lt", 300);
    });
  });
});

describe("issue 47951", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("should do X (metabase#47951)", () => {
    cy.log("set up permissions");
    cy.updatePermissionsGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
      [USER_GROUPS.DATA_GROUP]: {
        [SAMPLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
    });

    cy.log("set up remapping");
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("PUT", `/api/field/${REVIEWS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
    cy.request("POST", `/api/field/${REVIEWS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.log("create a dashboard");
    const parameter = createMockParameter({
      id: "p1",
      slug: "p1",
      type: "id",
      sectionId: "id",
      default: 1,
    });
    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [parameter],
      },
      questions: [
        { name: "q1", query: { "source-table": ORDERS_ID } },
        { name: "q2", query: { "source-table": REVIEWS_ID } },
      ],
    }).then(({ dashboard: dashboard, questions: [card1, card2] }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card1.id,
            parameter_mappings: [
              {
                card_id: card1.id,
                parameter_id: parameter.id,
                target: ["dimension", ["field", ORDERS.PRODUCT_ID, null]],
              },
            ],
          },
          {
            card_id: card2.id,
            parameter_mappings: [
              {
                card_id: card2.id,
                parameter_id: parameter.id,
                target: ["dimension", ["field", REVIEWS.PRODUCT_ID, null]],
              },
            ],
          },
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });

    cy.log("log in as a normal user and open the dashboard");
    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");

    cy.log("check remapping for default values");
    H.filterWidget().findByText("Rustic Paper Wallet").should("be.visible");

    cy.log("check remapping for dropdown values");
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Rustic Paper Wallet").should("be.visible");
      cy.findByText("Aerodynamic Bronze Hat").should("be.visible");
    });
  });
});

describe("issue 59306", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const parameter = createMockParameter({
      id: "p1",
      slug: "p1",
      type: "string/=",
      sectionId: "string",
      default: undefined,
      values_query_type: "none",
    });

    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [parameter],
      },
      questions: [{ name: "q1", query: { "source-table": PRODUCTS_ID } }],
    }).then(({ dashboard, questions: [card] }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: card.id,
            parameter_mappings: [
              {
                card_id: card.id,
                parameter_id: parameter.id,
                target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                has_field_values: "input",
              },
            ],
          },
        ],
      }).then(() => {
        H.visitDashboard(dashboard.id);
      });
    });
  });

  it("should not overflow the filter box (metabase#59306)", () => {
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter some text")
        .type("asdf".repeat(20))
        .invoke("outerWidth")
        .should("be.lt", 400);
    });
  });
});

describe("Issue 60987", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
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
                  PRODUCTS.ID,
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "Products",
                  },
                ],
              ],
            },
          ],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });
  });

  it("should show the empty state for parameters when searching the in the parameter target picker popover (metabase#60987)", () => {
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.getDashboardCard().findByText("Select…").click();
    H.popover().findByPlaceholderText("Find...").type("aa");
    H.popover().findByText("Didn't find any results").should("be.visible");
  });
});

describe("Issue 60987", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
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
                  PRODUCTS.ID,
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "Products",
                  },
                ],
              ],
            },
          ],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });

    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.getDashboardCard().findByText("Select…").click();
  });

  it("should show the empty state for parameters when searching the in the parameter target picker popover (metabase#60987)", () => {
    H.popover().within(() => {
      cy.findByPlaceholderText("Find...").type("aa");
      cy.findByText("Didn't find any results")
        .should("be.visible")
        .should("have.css", "color", "rgba(7, 23, 34, 0.62)"); // the text "text-medium"
    });
  });
});

describe("Issue 46767", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        type: "question",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              "source-table": PRODUCTS_ID,
              fields: "all",
              strategy: "left-join",
              alias: "Products",
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
                  PRODUCTS.ID,
                  {
                    "base-type": "type/BigInteger",
                    "join-alias": "Products",
                  },
                ],
              ],
            },
          ],
        },
      },
    }).then((response) => {
      H.visitDashboard(response.body.dashboard_id);
    });

    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.getDashboardCard().findByText("Select…").click();
  });

  it("search results for parameter target picker should not show empty sections (metabase#46767)", () => {
    H.popover().within(() => {
      cy.findByPlaceholderText("Find...").type("Ean");
      cy.findByText("Products").should("be.visible");
      cy.findByText("User").should("not.exist");
    });
  });
});

describe("issue 46541", () => {
  const TARGET_FILTER = {
    name: "Target filter",
    slug: "target-filter",
    id: "ffa421da",
    type: "number/>=",
    sectionId: "number",
  };

  const OTHER_FILTER = {
    name: "Other filter",
    slug: "other-filter",
    id: "dfaa3356",
    type: "number/>=",
    sectionId: "number",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: "Dashboard A",
      },
    }).then(({ body }) => {
      cy.wrap(body.dashboard_id).as("dashboardA");

      H.createQuestionAndDashboard({
        questionDetails: {
          query: { "source-table": ORDERS_ID },
        },
        dashboardDetails: {
          name: "Dashboard B",
          parameters: [TARGET_FILTER, OTHER_FILTER],
        },
      }).then(({ body }) => {
        cy.wrap(body.dashboard_id).as("dashboardB");

        H.updateDashboardCards({
          dashboard_id: body.dashboard_id,
          cards: [
            {
              card_id: body.card_id,
              parameter_mappings: [
                {
                  parameter_id: TARGET_FILTER.id,
                  card_id: body.card_id,
                  target: ["dimension", ["field", ORDERS.TOTAL, null]],
                },
                {
                  parameter_id: OTHER_FILTER.id,
                  card_id: body.card_id,
                  target: ["dimension", ["field", ORDERS.SUBTOTAL, null]],
                },
              ],
            },
          ],
        });

        cy.log("Set parameter value on Dashboard B");
        H.visitDashboard("@dashboardB");
        H.filterWidget(OTHER_FILTER).click();
        H.popover().within(() => {
          cy.findByPlaceholderText("Enter a number").type("10");
          cy.button("Add filter").click();
        });

        cy.log("Set up click behaviour on Dashboard A");
        H.visitDashboard("@dashboardA");
        H.editDashboard();

        H.showDashboardCardActions();
        cy.findByLabelText("Click behavior").click();

        H.sidebar().within(() => {
          cy.findByText("Tax").click();
          cy.findByText("Go to a custom destination").click();
          cy.findByText("Dashboard").click();
        });

        H.entityPickerModal().within(() => {
          cy.findByText("Our analytics").click();
          cy.findByText("Dashboard B").click();
        });

        H.sidebar().findByText(TARGET_FILTER.name).click();
        H.popover().findByText("Tax").click();
        H.saveDashboard();
      });
    });
  });

  it("should reset other filters when coming to a dashboard from a click action with a filter (metabase#46541)", () => {
    cy.log("Navigate from Dashboard A to Dashboard B with a click action");
    H.tableInteractiveBody().findByText("2.07").click();

    H.filterWidget(TARGET_FILTER).should("contain", "2.07");
    H.filterWidget(OTHER_FILTER).should("not.contain", "10");
  });
});

describe("issue 46372", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show a scrollbar when auto-connecting a dashcard filter (metabase#46372)", () => {
    H.createDashboardWithQuestions({
      questions: [
        { name: "Question A", query: { "source-table": PRODUCTS_ID } },
        { name: "Question B", query: { "source-table": PRODUCTS_ID } },
      ],
    }).then(({ dashboard }) => {
      H.visitDashboard(dashboard.id);
      H.editDashboard(dashboard.id);

      H.setFilter("Text or Category", "Is");
      H.selectDashboardFilter(cy.findAllByTestId("dashcard").first(), "Title");
      H.undoToast().findByRole("button", { name: "Auto-connect" }).click();

      H.main().findByText("Auto-connected").should("be.visible");
      H.main()
        .findByText("Auto-connected")
        .parent()
        .parent()
        .then(($body) => {
          cy.wrap($body[0].scrollHeight).should("eq", $body[0].offsetHeight);
        });
    });
  });
});

describe("issue 49319", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should ignore parameters that not exist in the saved dashboard in edit mode (metabase#49319)", () => {
    cy.log("open an existing dashboard");
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.log("add a parameter and save the dashboard");
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Vendor");
    H.saveDashboard();

    cy.log("add another parameter to the dashboard with a default value");
    H.editDashboard();
    H.setFilter("Text or Category", "Is");
    H.selectDashboardFilter(H.getDashboardCard(), "Category");
    H.dashboardParameterSidebar().findByText("No default").click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.dashboardParameterSidebar().button("Done").click();

    cy.log("change the value for the saved parameter");
    cy.findByTestId("fixed-width-filters").findByText("Text").click();
    H.dashboardParameterSidebar().findByText("No default").click();
    H.popover().within(() => {
      cy.findByText("Americo Sipes and Sons").click();
      cy.findByText("Barrows-Johns").click();
      cy.button("Add filter").click();
    });
    H.dashboardParameterSidebar().button("Done").click();

    cy.log("the unsaved parameter should be ignored in edit mode");
    H.assertTableRowsCount(179);

    cy.log("both parameters should be applied when the dashboard is saved");
    H.saveDashboard();
    H.assertTableRowsCount(82);
  });
});
