const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > scalar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  const SCREEN_SIZES = {
    mobile: [600, 400],
    tablet: [900, 600],
    desktop: [1200, 800],
    hd: [1920, 1280],
  };

  Object.entries(SCREEN_SIZES).forEach(([size, viewport]) => {
    it(`should render human readable numbers on ${size} screen size (metabase`, () => {
      const [width, height] = viewport;

      cy.viewport(width, height);
      H.createQuestionAndDashboard({
        questionDetails: {
          name: "12629",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
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
        H.visitDashboard(dashboard_id);
        // cards on mobile take up the full viewport width so there is enough room to display the uncompacted value
        // If https://github.com/metabase/metabase/issues/6201 is completed this may change but in this instance showing
        // the uncompacted value for mobile is the expected behaviour.
        if (size === "mobile") {
          cy.findByText("1,510,621,683,050.63");
        } else {
          cy.findByText("1.5T");
        }
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

    H.leftSidebar().within(() => {
      cy.findByText("Show the time").should("not.exist");
      cy.findByText("Time style").should("not.exist");
    });
  });

  describe("issue 33208", () => {
    beforeEach(() => {
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
});
