const { H } = cy;
import Color from "color";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > scalar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow open-ended conditional color ranges", () => {
    H.createQuestion({
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
    }).then(({ body: { id } }) => {
      cy.visit(`/question/${id}`);
      cy.findByTestId("query-visualization-root", { timeout: 20000 })
        .findByTestId("scalar-value")
        .should("be.visible");
    });

    H.openVizSettingsSidebar();
    H.sidebar().findByText("Conditional colors").click();

    cy.findByRole("button", { name: /add a range/i }).click();

    cy.findAllByPlaceholderText("Min").eq(0).clear().blur();
    cy.findAllByPlaceholderText("Max").eq(0).clear().type("1000").blur();

    cy.findByRole("button", { name: /add a range/i }).click();

    cy.findAllByPlaceholderText("Min").eq(1).clear().type("1000").blur();
    cy.findAllByPlaceholderText("Max").eq(1).clear().blur();

    cy.findAllByTestId("color-selector-button").eq(1).click();
    H.popover()
      .findAllByRole("button")
      .eq(4)
      .then(($button) => {
        const color = $button.attr("aria-label");
        cy.wrap($button).click();
        cy.findByTestId("scalar-value").should(
          "have.css",
          "color",
          Color(color).rgb().string(),
        );
      });

    cy.findByTestId("scalar-value").realHover();
    H.tooltip().should("contain.text", "≤ 1000").and("contain.text", "≥ 1000");
  });

  it("should render human readable numbers on every screen size (metabase#12629)", () => {
    // The mobile size sits between two compacted sizes, so each value check runs on a page that showed a different value before.
    const SCREEN_SIZES: [string, [number, number]][] = [
      ["tablet", [900, 600]],
      ["mobile", [600, 400]],
      ["desktop", [1200, 800]],
      ["hd", [1920, 1280]],
    ];

    H.createQuestionAndDashboard({
      questionDetails: {
        name: "12629",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            // @ts-expect-error the `Aggregation` type has no arithmetic expressions
            ["*", 1000000, ["sum", ["field", ORDERS.TOTAL, null]]],
          ],
        },
        display: "scalar",
      },
      cardDetails: {
        size_x: 5,
        size_y: 4,
      },
    }).then(({ body: { dashboard_id } }) => {
      SCREEN_SIZES.forEach(([size, [width, height]]) => {
        cy.log(`${size} screen size`);
        cy.viewport(width, height);
        H.visitDashboard(dashboard_id);
        // cards on mobile take up the full viewport width so there is enough room to display the uncompacted value
        // If https://github.com/metabase/metabase/issues/6201 is completed this may change but in this instance showing
        // the uncompacted value for mobile is the expected behaviour.
        H.getDashboardCard()
          .findByText(size === "mobile" ? "1,510,621,683,050.63" : "1.5T")
          .should("be.visible");
      });
    });
  });

  it("should render date without time (metabase#7494)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT cast('2024-05-01T00:00:00Z'::timestamp as date)",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "scalar",
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 30, 2024");
    H.openVizSettingsSidebar();

    H.sidebar().findByText("Date style").should("be.visible");
    H.sidebar().findByText("Show the time").should("be.hidden");
    H.sidebar().findByText("Time style").should("be.hidden");
  });

  it("should not auto-select chart type when opening and saving a native question with parameters that have default values (metabase#33208)", () => {
    H.createNativeQuestion(
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
              // @ts-expect-error the `TemplateTag` type allows only a single string default
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

    // The default value for the category parameter is ["Doohickey","Gizmo"], which means the query results should have two rows, meaning
    // scalar is not a sensible chart type. Normally the chart type would be automatically changed to table, but this shouldn't happen.
    cy.findByTestId("scalar-value").should("be.visible");

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.findByTestId("query-builder-main").findByText("Open Editor").click();
    H.NativeEditor.focus().type(" ");
    H.saveSavedQuestion();
    H.runNativeQuery({ wait: false });
    cy.wait("@cardQuery");

    // The run button shows the refresh icon when the query completes
    cy.findByTestId("native-query-editor-container")
      .icon("refresh")
      .should("be.visible");
    cy.findByTestId("scalar-value").should("be.visible");
    H.tableInteractive().should("not.exist");
  });
});
