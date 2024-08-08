import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  cartesianChartCircle,
  withDatabase,
  openSeriesSettings,
  echartsContainer,
  testPairedTooltipValues,
  filter,
  filterWidget,
  filterField,
  visitAlias,
  queryBuilderMain,
  queryBuilderHeader,
  visitQuestionAdhoc,
  sidebar,
  chartPathWithFillColor,
  summarize,
  saveDashboard,
  visitDashboard,
  editDashboard,
  createQuestion,
  visualize,
  openNotebook,
  removeSummaryGroupingField,
  addSummaryField,
  addSummaryGroupingField,
  selectFilterOperator,
  saveSavedQuestion,
  runNativeQuery,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;
const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;
const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 13504", () => {
  const questionDetails = {
    name: "13504",
    display: "line",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        filter: [">", ["field", ORDERS.TOTAL, null], 50],
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 100],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should remove post-aggregation filters from a multi-stage query (metabase#13504)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cartesianChartCircle().eq(0).click({ force: true });

    popover().findByText("See these Orders").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Total is greater than 50").should("be.visible");
      cy.findByText("Created At is Mar 1–31, 2023").should("be.visible");
    });
  });
});

const externalDatabaseId = 2;

describe("issue 16170", { tags: "@mongo" }, () => {
  function replaceMissingValuesWith(value) {
    cy.findByText("Replace missing values with")
      .parent()
      .within(() => {
        cy.findByTestId("select-button").click();
      });

    popover().contains(value).click();
  }

  function assertOnTheYAxis() {
    echartsContainer().get("text").contains("Count");

    echartsContainer().get("text").contains("6,000");
  }
  beforeEach(() => {
    restore("mongo-5");
    cy.signInAsAdmin();

    withDatabase(externalDatabaseId, ({ ORDERS, ORDERS_ID }) => {
      const questionDetails = {
        name: "16170",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: externalDatabaseId,
        display: "line",
      };

      cy.createQuestion(questionDetails, { visitQuestion: true });
    });
  });

  ["Zero", "Nothing"].forEach(replacementValue => {
    it(`replace missing values with "${replacementValue}" should work on Mongo (metabase#16170)`, () => {
      cy.findByTestId("viz-settings-button").click();

      openSeriesSettings("Count");

      replaceMissingValuesWith(replacementValue);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Done").click();

      assertOnTheYAxis();

      cartesianChartCircle().eq(-2).trigger("mousemove");

      popover().within(() => {
        testPairedTooltipValues("Created At", "2019");
        testPairedTooltipValues("Count", "6,524");
      });
    });
  });
});

describe("issue 17524", () => {
  const nativeQuestionDetails = {
    native: {
      query:
        "select * from (\nselect 'A' step, 41 users, 42 median union all\nselect 'B' step, 31 users, 32 median union all\nselect 'C' step, 21 users, 22 median union all\nselect 'D' step, 11 users, 12 median\n) x\n[[where users>{{num}}]]\n",
      "template-tags": {
        num: {
          id: "d7f1fb15-c7b8-6051-443d-604b6ed5457b",
          name: "num",
          "display-name": "Num",
          type: "number",
          default: null,
        },
      },
    },
    display: "funnel",
    visualization_settings: {
      "funnel.dimension": "STEP",
      "funnel.metric": "USERS",
    },
  };

  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "funnel",
    visualization_settings: {
      "funnel.metric": "count",
      "funnel.dimension": "CATEGORY",
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("scenario 1", () => {
    beforeEach(() => {
      cy.createNativeQuestion(nativeQuestionDetails, { visitQuestion: true });
    });

    it("should not alter visualization type when applying filter on a native question (metabase#17524-1)", () => {
      filterWidget().type("1");

      cy.get("polygon");

      cy.icon("play").last().click();

      cy.get("polygon");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").should("not.exist");
    });
  });

  describe("scenario 2", () => {
    beforeEach(() => {
      cy.createQuestion(questionDetails, { visitQuestion: true });
    });

    it("should not alter visualization type when applying filter on a QB question (metabase#17524-2)", () => {
      cy.get("polygon");

      filter();

      filterField("ID", {
        operator: "Greater than",
        value: "1",
      });
      cy.findByTestId("apply-filters").click();

      cy.get("polygon");
    });
  });
});

describe("issue 18061", () => {
  const questionDetails = {
    name: "18061",
    query: {
      "source-table": PEOPLE_ID,
      expressions: {
        CClat: [
          "case",
          [
            [
              [">", ["field", PEOPLE.ID, null], 1],
              ["field", PEOPLE.LATITUDE, null],
            ],
          ],
        ],
        CClong: [
          "case",
          [
            [
              [">", ["field", PEOPLE.ID, null], 1],
              ["field", PEOPLE.LONGITUDE, null],
            ],
          ],
        ],
      },
      filter: ["<", ["field", PEOPLE.ID, null], 3],
    },
    display: "map",
    visualization_settings: {
      "map.latitude_column": "CClat",
      "map.longitude_column": "CClong",
    },
  };

  const filter = {
    name: "Category",
    slug: "category",
    id: "749a03b5",
    type: "category",
  };

  const dashboardDetails = { name: "18061D", parameters: [filter] };

  function addFilter(filter) {
    filterWidget().click();
    popover().contains(filter).click();
    cy.button("Add filter").click();
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: dashboardCard }) => {
        const { dashboard_id, card_id } = dashboardCard;

        // Enable sharing
        cy.request("POST", `/api/dashboard/${dashboard_id}/public_link`).then(
          ({ body: { uuid } }) => {
            cy.wrap(`/public/dashboard/${uuid}`).as("publicLink");
          },
        );

        cy.wrap(`/question/${card_id}`).as("questionUrl");
        cy.wrap(`/dashboard/${dashboard_id}`).as("dashboardUrl");

        cy.intercept("POST", `/api/card/${card_id}/query`).as("cardQuery");
        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
        ).as("dashCardQuery");
        cy.intercept("GET", `/api/card/${card_id}`).as("getCard");

        const mapFilterToCard = {
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id,
              target: ["dimension", ["field", PEOPLE.SOURCE, null]],
            },
          ],
        };

        cy.editDashboardCard(dashboardCard, mapFilterToCard);
      },
    );
  });

  context("scenario 1: question with a filter", () => {
    it("should handle data sets that contain only null values for longitude/latitude (metabase#18061-1)", () => {
      visitAlias("@questionUrl");

      cy.wait("@getCard");
      cy.wait("@cardQuery");

      cy.window().then(w => (w.beforeReload = true));

      queryBuilderHeader().findByTestId("filters-visibility-control").click();
      cy.findByTestId("qb-filters-panel")
        .findByText("ID is less than 3")
        .click();
      popover().within(() => {
        cy.findByDisplayValue("3").type("{backspace}2");
        cy.button("Update filter").click();
      });

      queryBuilderMain().findByText("Something went wrong").should("not.exist");

      cy.findByTestId("qb-filters-panel")
        .findByText("ID is less than 2")
        .should("be.visible");
      cy.get("[data-element-id=pin-map]").should("be.visible");

      cy.window().should("have.prop", "beforeReload", true);
    });
  });

  context("scenario 2: dashboard with a filter", () => {
    it("should handle data sets that contain only null values for longitude/latitude (metabase#18061-2)", () => {
      visitAlias("@dashboardUrl");

      cy.wait("@dashCardQuery");

      addFilter("Twitter");

      cy.wait("@dashCardQuery");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Something went wrong").should("not.exist");

      cy.location("search").should("eq", "?category=Twitter");
    });
  });

  context("scenario 3: publicly shared dashboard with a filter", () => {
    it("should handle data sets that contain only null values for longitude/latitude (metabase#18061-3)", () => {
      visitAlias("@publicLink");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18061D");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18061");
      cy.get("[data-element-id=pin-map]");

      addFilter("Twitter");
      cy.location("search").should("eq", "?category=Twitter");
      cy.findAllByTestId("no-results-image");
      cy.get("[data-element-id=pin-map]").should("not.exist");
    });
  });
});

describe("issue 18063", () => {
  const questionDetails = {
    name: "18063",
    native: {
      query:
        'select null "LATITUDE", null "LONGITUDE", null "COUNT", \'NULL ROW\' "NAME"\nunion all select 55.6761, 12.5683, 1, \'Copenhagen\'\n',
      "template-tags": {},
    },
    display: "map",
  };

  function selectFieldValue(field, value) {
    cy.findByText(field)
      .parent()
      .within(() => {
        cy.findByText("Select a field").click();
      });

    popover().findByText(value).click();
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    // Select a Pin map
    cy.findByTestId("viz-settings-button").click();
    cy.findAllByTestId("select-button").contains("Region map").click();

    popover().contains("Pin map").click();

    // Click anywhere to close both popovers that open automatically.
    // Please see: https://github.com/metabase/metabase/issues/18063#issuecomment-927836691
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Latitude field").click();
  });

  it("should show the correct tooltip details for pin map even when some locations are null (metabase#18063)", () => {
    selectFieldValue("Latitude field", "LATITUDE");
    selectFieldValue("Longitude field", "LONGITUDE");

    cy.get(".leaflet-marker-icon").trigger("mousemove");

    popover().within(() => {
      testPairedTooltipValues("LATITUDE", "55.68");
      testPairedTooltipValues("LONGITUDE", "12.57");
      testPairedTooltipValues("COUNT", "1");
      testPairedTooltipValues("NAME", "Copenhagen");
    });
  });
});

describe("issue 18776", () => {
  const questionDetails = {
    dataset_query: {
      type: "native",
      native: {
        query: `
  select 101002 as "id", 1 as "rate"
  union all select 103017, 2
  union all select 210002, 3`,
      },
      database: SAMPLE_DB_ID,
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["id"],
      "graph.metrics": ["rate"],
      "graph.x_axis.axis_enabled": false,
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not freeze when opening a timeseries chart with sparse data and without the X-axis", () => {
    visitQuestionAdhoc(questionDetails);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").should("be.visible");
  });
});

describe("issue 20548", () => {
  const questionDetails = {
    name: "20548",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    display: "bar",
    // We are reversing the order of metrics via API
    visualization_settings: {
      "graph.metrics": ["count", "sum"],
      "graph.dimensions": ["CATEGORY"],
    },
  };

  function removeAggregationItem(item) {
    cy.findAllByTestId("aggregation-item")
      .contains(item)
      .siblings(".Icon-close")
      .click();

    cy.wait("@dataset");
  }

  function addAggregationItem(item) {
    cy.findByTestId("add-aggregation-button").click();
    popover().contains(item).click();

    cy.wait("@dataset");
  }

  /**
   * @param {string} item
   * @param {number} frequency
   */
  function assertOnLegendItemFrequency(item, frequency) {
    cy.findAllByTestId("legend-item")
      .contains(item)
      .should("have.length", frequency);
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
    summarize();
  });

  it("should not display duplicate Y-axis after modifying/reordering metrics (metabase#20548)", () => {
    removeAggregationItem("Count");
    // Ensure bars of only one series exist
    chartPathWithFillColor("#88BF4D").should("have.length", 4);
    chartPathWithFillColor("#509EE3").should("not.exist");

    addAggregationItem("Count");
    // Ensure bars of two series exist
    chartPathWithFillColor("#88BF4D").should("have.length", 4);
    chartPathWithFillColor("#509EE3").should("have.length", 4);

    // Although the test already fails on the previous step, let's add some more assertions to prevent future regressions
    assertOnLegendItemFrequency("Count", 1);
    assertOnLegendItemFrequency("Sum of Price", 1);

    cy.findByTestId("viz-settings-button").click();
    // Implicit assertion - it would fail if it finds more than one "Count" in the sidebar
    sidebar().findAllByText("Count").should("have.length", 1);
  });
});

describe("issue 21452", () => {
  const questionDetails = {
    dataset_query: {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["cum-sum", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      database: 1,
    },
    display: "line",
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);

    cy.findByTestId("viz-settings-button").click();
  });

  it("should not fire POST request after every character during display name change (metabase#21452)", () => {
    openSeriesSettings("Cumulative sum of Quantity");
    cy.findByDisplayValue("Cumulative sum of Quantity").clear().type("Foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Display type").click();
    // Dismiss the popup and close settings
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    cartesianChartCircle().first().realHover();

    popover().within(() => {
      testPairedTooltipValues("Created At", "2022");
      testPairedTooltipValues("Foo", "3,236");
    });

    cy.get("@dataset.all").should("have.length", 1);
  });
});

describe("issue 21504", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should format pie chart settings (metabase#21504)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "pie",
    });

    cy.findByTestId("viz-settings-button").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Display").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 2022").should("be.visible");
  });
});

describe("issue 21665", () => {
  const Q1 = {
    name: "21665 Q1",
    native: { query: "select 1" },
    display: "scalar",
  };

  const Q2 = {
    name: "21665 Q2",
    native: { query: "select 2" },
    display: "scalar",
  };
  function editQ2NativeQuery(query, questionId) {
    cy.request("PUT", `/api/card/${questionId}`, {
      dataset_query: {
        type: "native",
        native: { query },
        database: 1,
      },
    });
  }
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestionAndDashboard({
      questionDetails: Q1,
      dashboardDetails: { name: "21665D" },
    }).then(({ dashboardId, questionId }) => {
      cy.intercept(
        "GET",
        `/api/dashboard/${dashboardId}*`,
        cy.spy().as("dashboardLoaded"),
      ).as("getDashboard");

      cy.wrap(questionId).as("questionId");
      cy.log("dashboard id", dashboardId);
      cy.wrap(dashboardId).as("dashboardId");

      cy.createNativeQuestion(Q2);

      visitDashboard(dashboardId);
      editDashboard();
    });

    cy.findByTestId("add-series-button").click({ force: true });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(Q2.name).click();

    cy.findByTestId("add-series-modal").button("Done").click();

    saveDashboard();
    cy.wait("@getDashboard");
  });

  it("multi-series cards shouldnt cause frontend to reload (metabase#21665)", () => {
    cy.get("@questionId").then(questionId => {
      editQ2NativeQuery("select order by --", questionId);
    });

    visitDashboard("@dashboardId");

    cy.get("@dashboardLoaded").should("have.been.calledThrice");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem displaying this chart.").should(
      "be.visible",
    );
  });
});

describe.skip("issue 22527", () => {
  const questionDetails = {
    native: {
      query:
        "select 1 x, 1 y, 20 size\nunion all  select 2 x, 10 y, 10 size\nunion all  select 3 x, -9 y, 6 size\nunion all  select 4 x, 100 y, 30 size\nunion all  select 5 x, -20 y, 70 size",
    },
    display: "scatter",
    visualization_settings: {
      "graph.dimensions": ["X"],
      "graph.metrics": ["Y"],
    },
  };

  function assertion() {
    cy.get("circle").should("have.length", 5).last().realHover();

    popover().within(() => {
      testPairedTooltipValues("X", "5");
      testPairedTooltipValues("Y", "-20");
      testPairedTooltipValues("SIZE", "70");
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("should render negative values in a scatter visualziation (metabase#22527)", () => {
    assertion();

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTextEnsureVisible("Data").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Bubble size").parent().contains("Select a field").click();

    popover().contains(/size/i).click();

    assertion();
  });
});

describe("issue 25007", () => {
  const questionDetails = {
    name: "11435",
    display: "line",
    native: {
      query: `SELECT dateadd('day', CAST((1 - CASE WHEN ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) = 0 THEN 7 ELSE ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) END) AS long), CAST("PUBLIC"."ORDERS"."CREATED_AT" AS date)) AS "CREATED_AT", count(*) AS "count"
  FROM "PUBLIC"."ORDERS"
  GROUP BY dateadd('day', CAST((1 - CASE WHEN ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) = 0 THEN 7 ELSE ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) END) AS long), CAST("PUBLIC"."ORDERS"."CREATED_AT" AS date))
  ORDER BY dateadd('day', CAST((1 - CASE WHEN ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) = 0 THEN 7 ELSE ((iso_day_of_week("PUBLIC"."ORDERS"."CREATED_AT") + 1) % 7) END) AS long), CAST("PUBLIC"."ORDERS"."CREATED_AT" AS date)) ASC`,
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
    },
  };

  const clickLineDot = ({ index } = {}) => {
    cartesianChartCircle().eq(index).click({ force: true });
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display weeks correctly in tooltips for native questions (metabase#25007)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
    clickLineDot({ index: 1 });
    popover().findByTextEnsureVisible("May 1–7, 2022");
  });
});

describe("issue 25156", () => {
  const questionDetails = {
    name: "25156",
    query: {
      "source-table": REVIEWS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", REVIEWS.CREATED_AT, { "temporal-unit": "year" }],
        ["field", REVIEWS.RATING, null],
      ],
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT", "RATING"],
      "graph.metrics": ["count"],
      "graph.x_axis.scale": "linear",
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should handle invalid x-axis scale (metabase#25156)", () => {
    createQuestion(questionDetails, { visitQuestion: true });

    echartsContainer()
      .should("contain", "2022")
      .and("contain", "2023")
      .and("contain", "2023")
      .and("contain", "2024")
      .and("contain", "2025");
  });
});

describe("issue 27279", () => {
  const questionDetails = {
    name: "27279",
    native: {
      query:
        "select -3 o, 'F2021' k, 1 v\nunion all select -2, 'V2021', 2\nunion all select -1, 'S2022', 3\nunion all select 0, 'F2022', 4",
      "template-tags": {},
    },
    visualization_settings: {
      "table.pivot_column": "O",
      "table.cell_column": "V",
    },
  };
  function compareValuesInOrder(selector, values) {
    selector.each(($item, index) => {
      cy.wrap($item).invoke("text").should("eq", values[index]);
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should reflect/apply sorting to the x-axis (metabase#27279)", () => {
    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": `card__${id}`,
            aggregation: [
              ["sum", ["field", "V", { "base-type": "type/Integer" }]],
            ],
            breakout: [
              ["field", "K", { "base-type": "type/Text" }],
              ["field", "O", { "base-type": "type/Integer" }],
            ],
            "order-by": [
              ["asc", ["field", "O", { "base-type": "type/Integer" }]],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["K", "O"],
          "graph.metrics": ["sum"],
        },
      });
    });

    const legendItems = ["-3", "-2", "-1", "0"];
    compareValuesInOrder(cy.findAllByTestId("legend-item"), legendItems);

    // need to add a single space on either side of the text as it is used as padding
    // in ECharts
    const xAxisTicks = ["F2021", "V2021", "S2022", "F2022"].map(
      str => ` ${str} `,
    );
    compareValuesInOrder(
      echartsContainer()
        .get("text")
        .contains(/F2021|V2021|S2022|F2022/),
      xAxisTicks,
    );

    // Extra step, just to be overly cautious
    chartPathWithFillColor("#98D9D9").realHover();
    popover().within(() => {
      testPairedTooltipValues("K", "F2021");
      testPairedTooltipValues("O", "-3");
      testPairedTooltipValues("Sum of V", "1");
    });

    chartPathWithFillColor("#509EE3").realHover();
    popover().within(() => {
      testPairedTooltipValues("K", "F2022");
      testPairedTooltipValues("O", "0");
      testPairedTooltipValues("Sum of V", "4");
    });
  });
});

describe("issue 27427", () => {
  const questionDetails = {
    name: "27427",
    native: {
      query:
        "select 1 as sortorder, year(current_timestamp), 1 v1, 2 v2\nunion all select 1, year(current_timestamp)-1, 1, 2",
      "template-tags": {},
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["EXTRACT(YEAR FROM CURRENT_TIMESTAMP)"],
      "graph.metrics": ["V1", "V2"],
      "graph.series_order_dimension": null,
      "graph.series_order": null,
    },
  };

  function assertStaticVizRender(questionDetails, callback) {
    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.request({
        method: "GET",
        url: `/api/pulse/preview_card/${id}`,
        failOnStatusCode: false,
      }).then(response => {
        callback(response);
      });
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("static-viz should not fail if there is unused returned column: 'divide by zero' (metabase#27427)", () => {
    assertStaticVizRender(questionDetails, ({ status, body }) => {
      expect(status).to.eq(200);
      expect(body).to.not.include(
        "An error occurred while displaying this card.",
      );
    });
  });
});

const addCountGreaterThan2Filter = () => {
  openNotebook();
  cy.findAllByTestId("action-buttons").last().button("Filter").click();
  popover().findByText("Count").click();
  selectFilterOperator("Greater than");
  popover().within(() => {
    cy.findByPlaceholderText("Enter a number").type("2");
    cy.button("Add filter").click();
  });
};

describe("issue 32075", () => {
  const testQuery = {
    type: "query",
    query: {
      "source-query": {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.LATITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
          [
            "field",
            PEOPLE.LONGITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
        ],
      },
    },
    database: SAMPLE_DB_ID,
  };

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should still display visualization as a map after adding a filter (metabase#32075)", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    addCountGreaterThan2Filter();
    visualize();

    cy.findByTestId("TableInteractive-root").should("not.exist");
    cy.get("[data-element-id=pin-map]").should("exist");
  });

  it("should still display visualization as a map after adding another column to group by", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    openNotebook();
    addSummaryGroupingField({ field: "Birth Date" });
    visualize();

    cy.findByTestId("TableInteractive-root").should("not.exist");
    cy.get("[data-element-id=pin-map]").should("exist");
  });

  it("should still display visualization as a map after adding another aggregation", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    openNotebook();
    addSummaryField({ metric: "Average of ...", field: "Longitude" });
    visualize();

    cy.findByTestId("TableInteractive-root").should("not.exist");
    cy.get("[data-element-id=pin-map]").should("exist");
  });

  it("should change display to default after removing a column to group by when map is not sensible anymore", () => {
    visitQuestionAdhoc({ dataset_query: testQuery }, { mode: "notebook" });

    visualize();
    openNotebook();
    removeSummaryGroupingField({ field: "Latitude: Auto binned" });
    visualize();

    cy.get("[data-element-id=pin-map]").should("not.exist");
    echartsContainer().should("exist");
  });
});

describe("issue 30058", () => {
  const testQuery = {
    type: "query",
    query: {
      "source-query": {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PEOPLE.LATITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
          [
            "field",
            PEOPLE.LONGITUDE,
            { "base-type": "type/Float", binning: { strategy: "default" } },
          ],
        ],
      },
    },
    database: SAMPLE_DB_ID,
  };

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not crash visualization after adding a filter (metabase#30058)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "map",
      displayIsLocked: true,
    });

    addCountGreaterThan2Filter();
    visualize();

    cy.get(".Icon-warning").should("not.exist");
  });
});

describe("issue 33208", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createNativeQuestion(
      {
        native: {
          query:
            "select distinct category from products where {{category}} order by category",
          "template-tags": {
            category: {
              type: "dimension",
              name: "category",
              id: "82e3e985-5bd8-4503-a628-15201bad321b",
              "display-name": "Category",
              required: true,
              default: ["Doohickey", "Gizmo"],
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "string/=",
            },
          },
        },
        display: "scalar",
      },
      { visitQuestion: true },
    );
  });

  it("should not auto-select chart type when opening a saved native question with parameters that have default values (metabase#33208)", () => {
    // The default value for the category parameter is ["Doohickey","Gizmo"], which means the query results should have two rows, meaning
    // scalar is not a sensible chart type. Normally the chart type would be automatically changed to table, but this shouldn't happen.
    cy.findByTestId("scalar-value").should("be.visible");
  });

  it("should not auto-select chart type when saving a native question with parameters that have default values", () => {
    cy.findByTestId("query-builder-main").findByText("Open Editor").click();
    cy.get(".ace_editor").type(" ");
    saveSavedQuestion("top category");
    runNativeQuery({ wait: false });
    cy.findByTestId("scalar-value").should("be.visible");
  });
});

describe("issue 43077", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not fire an invalid API request when clicking a legend item on a cartesian chart with multiple aggregations", () => {
    const cartesianQuestionDetails = {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: 1,
      },
      display: "line",
    };
    const cardRequestSpy = cy.spy();
    cy.intercept("/api/card/*", cardRequestSpy);

    visitQuestionAdhoc(cartesianQuestionDetails);

    cy.findAllByTestId("legend-item").first().click();

    cy.wait(100).then(() => expect(cardRequestSpy).not.to.have.been.called);
  });

  it("should not fire an invalid API request when clicking a legend item on a row chart with multiple aggregations", () => {
    const rowQuestionDetails = {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        database: 1,
      },
      display: "row",
    };
    const cardRequestSpy = cy.spy();
    cy.intercept("/api/card/*", cardRequestSpy);

    visitQuestionAdhoc(rowQuestionDetails);

    cy.findAllByTestId("legend-item").first().click();

    cy.wait(100).then(() => expect(cardRequestSpy).not.to.have.been.called);
  });
});
