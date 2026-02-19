const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > notebook > native query preview sidebar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show empty sidebar when no data source is selected", () => {
    cy.intercept("POST", "/api/dataset/native").as("nativeDataset");
    H.openReviewsTable({ mode: "notebook", limit: 1 });
    openSidebar();
    cy.wait("@nativeDataset");

    cy.findByTestId("app-bar").findByLabelText("New").click();
    H.popover().findByTextEnsureVisible("Question").click();
    H.miniPickerBrowseAll().click();
    cy.findByPlaceholderText("Search for tables and more...").should(
      "be.visible",
    );
    H.entityPickerModal().button("Close").click();

    cy.findByTestId("native-query-preview-sidebar").should("not.exist");
  });

  it("smoke test: should show the preview sidebar, update it, and close it", () => {
    const defaultRowLimit = 1048575;
    const queryLimit = 2;

    cy.intercept("POST", "/api/dataset/native").as("nativeDataset");

    H.openReviewsTable({ mode: "notebook", limit: queryLimit });
    openSidebar();
    cy.findByTestId("native-query-preview-sidebar").should("be.visible");

    cy.log("Refreshing the page does not persist the sidebar state");
    cy.reload();
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");

    openSidebar();
    cy.wait("@nativeDataset");
    cy.findByTestId("native-query-preview-sidebar").within(() => {
      cy.findByText("SQL for this question").should("exist");
      H.NativeEditor.get()
        .should("be.visible")
        .and("contain", "SELECT")
        .and("contain", queryLimit);
      cy.button("Convert this question to SQL").should("exist");
    });

    cy.log("Modifying GUI query should update the SQL preview");
    cy.findByTestId("step-limit-0-0").icon("close").click({ force: true });
    cy.wait("@nativeDataset");
    H.NativeEditor.get()
      .should("be.visible")
      .and("contain", "SELECT")
      .and("contain", defaultRowLimit)
      .and("not.contain", queryLimit);

    cy.log("It should be possible to close the sidebar");
    closeSidebar();
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");
  });

  it("should not offer the sidebar preview for a user without native permissions", () => {
    cy.signIn("nosql");
    H.openReviewsTable({ mode: "notebook" });
    cy.findByTestId("qb-header-action-panel")
      .findByLabelText(/View SQL/i)
      .should("not.exist");
    cy.findByLabelText("View SQL").should("not.exist");
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");
    cy.get("code").should("not.exist");
  });

  it(
    "should work on small screens",
    { viewportWidth: 480, viewportHeight: 800 },
    () => {
      H.openReviewsTable({ mode: "notebook", limit: 1 });
      cy.location("pathname").should("eq", "/question/notebook");

      cy.log("Opening a preview sidebar should completely cover the notebook");
      openSidebar();
      cy.location("pathname").should("eq", "/question/notebook");

      cy.log(
        "It shouldn't be possible to click on any of the notebook elements",
      );
      cy.button("Visualize").click({ timeout: 500 }); // no need to wait four seconds

      /**
       * The only reliable way to test that the button is not clickable because it is covered by another element.
       * Sources:
       *  - https://stackoverflow.com/a/52142935/8815185
       *  - https://github.com/cypress-io/cypress/discussions/21150#discussioncomment-2620947
       */
      cy.once("fail", (err) => {
        expect(err.message).to.include(
          "`cy.click()` failed because this element",
        );
        expect(err.message).to.include("is being covered by another element");
        // returning false here prevents Cypress from failing the test
        return false;
      });
    },
  );

  it("sidebar should be resizable", () => {
    const toleranceDelta = 0.5;

    const borderWidth = 1;
    const sidebarMargin = 4;
    const minNotebookWidth = 640;
    const minSidebarWidth = 428 - borderWidth;
    const maxSidebarWidth =
      Cypress.config("viewportWidth") -
      minNotebookWidth -
      borderWidth -
      sidebarMargin;

    cy.intercept("POST", "/api/dataset/query_metadata").as("metadata");
    cy.intercept("GET", "/api/session/properties").as("sessionProperties");
    cy.intercept("POST", "/api/dataset/native").as("nativeDataset");

    H.openReviewsTable({ mode: "notebook", limit: 1 });
    cy.wait("@metadata");
    openSidebar();
    cy.wait(["@nativeDataset", "@sessionProperties"]);

    cy.log(
      "It should not be possible to shrink the sidebar below its min (initial) width",
    );
    resizeSidebar(200, (initialSidebarWidth, sidebarWidth) => {
      expect(initialSidebarWidth).to.be.closeTo(
        minSidebarWidth,
        toleranceDelta,
      );
      expect(sidebarWidth).to.be.closeTo(initialSidebarWidth, toleranceDelta);
    });

    cy.log(
      "It should be possible to resize the sidebar but not above its max width",
    );
    resizeSidebar(-500, (initialSidebarWidth, sidebarWidth) => {
      expect(sidebarWidth).to.be.gt(initialSidebarWidth);
      expect(sidebarWidth).to.be.closeTo(maxSidebarWidth, toleranceDelta);
    });

    cy.log("User preferences should be preserved across sessions");
    cy.signOut();
    cy.signInAsAdmin();
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    H.openNotebook();
    openSidebar();
    cy.findByTestId("native-query-preview-sidebar")
      .should("be.visible")
      .then(($sidebar) => {
        const sidebarWidth = $sidebar[0].getBoundingClientRect().width;
        expect(sidebarWidth).to.be.closeTo(maxSidebarWidth, toleranceDelta);
      });

    cy.log("Preferences should not be shared across users");
    cy.signOut();
    cy.signInAsNormalUser();
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    H.openNotebook();
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");

    openSidebar();
    cy.findByTestId("native-query-preview-sidebar")
      .should("be.visible")
      .then(($sidebar) => {
        const sidebarWidth = $sidebar[0].getBoundingClientRect().width;
        expect(sidebarWidth).to.be.closeTo(minSidebarWidth, toleranceDelta);
      });
  });
});

describe("converting question to SQL (metabase#12651, metabase#21615, metabase#32121, metabase#40422)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to convert an ad-hoc time-series table query to SQL (metabase#21615)", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
    });

    cy.findByTestId("timeseries-chrome").should("be.visible");
    cy.findByLabelText("Row count").should("have.text", "Showing 49 rows");

    convertToSql();
    cy.log("`/notebook` should be removed from the URL (metabase#12651)");
    cy.location("pathname").should("eq", "/question");

    cy.findByTestId("timeseries-chrome").should("not.exist");
    cy.findByLabelText("Row count").should("have.text", "Showing 49 rows");
  });

  it("should be possible to save a question based on a table after converting to SQL (metabase#40422)", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    convertToSql();
    H.saveSavedQuestion();
    cy.get("[data-testid=cell-data]").should("contain", "37.65");

    cy.log(
      "should be possible to `Explore results` after saving a question (metabase#32121)",
    );
    cy.findByTestId("qb-header").findByText("Explore results").click();
    cy.get("[data-testid=cell-data]").should("contain", "37.65");
  });

  it("should be possible to save a question based on another question after converting to SQL (metabase#40422)", () => {
    H.createQuestion(
      { query: { "source-table": `card__${ORDERS_QUESTION_ID}` } },
      { visitQuestion: true },
    );
    convertToSql();
    H.saveSavedQuestion();
    cy.get("[data-testid=cell-data]").should("contain", "37.65");
  });
});

describe(
  "converting question to a native query (metabase#15946, metabase#32121, metabase#38181, metabase#40557)",
  { tags: "@mongo" },
  () => {
    const MONGO_DB_NAME = "QA Mongo";
    const MONGO_DB_ID = 2;

    beforeEach(() => {
      H.restore("mongo-5");
      cy.signInAsAdmin();
    });

    it("should work for both simple and nested questions based on previously converted GUI query", () => {
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText(MONGO_DB_NAME).click();
        cy.findByText("Products").click();
      });

      cy.log("Simple question");
      openSidebar("native");
      cy.findByTestId("native-query-preview-sidebar").within(() => {
        cy.findByText("Native query for this question").should("exist");
        H.NativeEditor.get()
          .should("be.visible")
          .and("contain", "$project")
          .and("contain", "$limit");

        cy.button("Convert this question to a native query").click();
      });

      cy.log("Database and table should be pre-selected (metabase#15946)");
      cy.findByTestId("selected-database").should("have.text", MONGO_DB_NAME);
      cy.findByTestId("selected-table").should("have.text", "Products");
      cy.get("[data-testid=cell-data]").should("contain", "Small Marble Shoes");

      cy.log("Nested question");
      cy.log(
        "should be possible to save a question and `Explore results` (metabase#32121)",
      );
      H.saveQuestion("foo", undefined, {
        path: ["Our analytics"],
      });
      cy.findByTestId("qb-header").findByText("Explore results").click();
      cy.get("[data-testid=cell-data]").should("contain", "Small Marble Shoes");

      cy.log("The generated query should be valid (metabase#38181)");
      H.openNotebook();
      openSidebar("native");
      cy.findByTestId("native-query-preview-sidebar").within(() => {
        cy.findByText("Native query for this question").should("exist");
        H.NativeEditor.get()
          .should("be.visible")
          .and("contain", "$project")
          .and("contain", "$limit")
          .and("not.contain", "BsonString")
          .and("not.contain", "BsonInt32");

        cy.button("Convert this question to a native query").click();
      });

      cy.log(
        "Database and table should be pre-selected (metabase#15946 and/or metabase#40557)",
      );
      cy.findByTestId("selected-database").should("have.text", MONGO_DB_NAME);
      cy.findByTestId("selected-table").should("have.text", "Products");
      cy.get("[data-testid=cell-data]").should("contain", "Small Marble Shoes");
    });

    it(
      "should work for a nested GUI question (metabase#40557)",
      { tags: "@skip" },
      () => {
        H.withDatabase(
          MONGO_DB_ID,
          ({ PRODUCTS_ID }: { PRODUCTS_ID: number }) => {
            H.createQuestion({
              name: "Mongo Source",
              query: {
                "source-table": PRODUCTS_ID,
                limit: 1,
              },
              database: MONGO_DB_ID,
            }).then(({ body: { id: sourceId } }) => {
              H.createQuestion(
                {
                  name: "Mongo Nested",
                  query: {
                    "source-table": `card__${sourceId}`,
                  },
                  database: MONGO_DB_ID,
                },
                { visitQuestion: true },
              );
            });
          },
        );

        cy.get("[data-testid=cell-data]").should(
          "contain",
          "Small Marble Shoes",
        );
        H.openNotebook();
        openSidebar("native");

        cy.findByTestId("native-query-preview-sidebar").within(() => {
          cy.findByText("Native query for this question").should("exist");
          H.NativeEditor.get()
            .should("be.visible")
            .and("contain", "$project")
            .and("contain", "$limit")
            .and("not.contain", "BsonString")
            .and("not.contain", "BsonInt32");

          cy.button("Convert this question to a native query").click();
        });

        cy.log("Database and table should be pre-selected (metabase#40557)");
        cy.findByTestId("selected-database").should("have.text", MONGO_DB_NAME);
        cy.findByTestId("selected-table").should("have.text", "Products");
        cy.get("[data-testid=cell-data]").should(
          "contain",
          "Small Marble Shoes",
        );
      },
    );
  },
);

describe("scenarios > notebook > native query preview sidebar tracking events", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should track `notebook_native_preview_shown|hidden` events", () => {
    cy.intercept("POST", "/api/dataset/native").as("nativeDataset");
    H.openReviewsTable({ mode: "notebook", limit: 1 });

    cy.findByLabelText("View SQL").click();
    cy.wait("@nativeDataset");
    cy.findByTestId("native-query-preview-sidebar").should("exist");

    H.expectUnstructuredSnowplowEvent({
      event: "notebook_native_preview_shown",
    });

    closeSidebar();
    cy.findByTestId("native-query-preview-sidebar").should("not.exist");

    H.expectUnstructuredSnowplowEvent({
      event: "notebook_native_preview_hidden",
    });
  });
});

function convertToSql() {
  H.openNotebook();
  cy.findByLabelText("View SQL").click();
  cy.intercept("POST", "/api/dataset").as("dataset");
  cy.button("Convert this question to SQL").click();
  cy.wait("@dataset");
  H.NativeEditor.get().should("be.visible");
}

type ResizeSidebarCallback = (
  initialSidebarWidth: number,
  sidebarWidth: number,
) => void;

function resizeSidebar(amountX: number, cb: ResizeSidebarCallback) {
  cy.intercept("PUT", "/api/setting/notebook-native-preview-sidebar-width").as(
    "updateSidebarWidth",
  );

  cy.findByTestId("native-query-preview-sidebar").then(($sidebar) => {
    const initialSidebarWidth = $sidebar[0].getBoundingClientRect().width;

    const options = {
      pointer: "mouse" as const,
      button: "left" as const,
    };

    // It is crucial to not chain the `realMouse` events here. We need to find
    // the up-to-date handle every single time because it gets re-rendered.
    cy.findByTestId("notebook-native-preview-resize-handle").realMouseDown(
      options,
    );
    cy.findByTestId("notebook-native-preview-resize-handle").realMouseMove(
      amountX,
      0,
    );
    cy.findByTestId("notebook-native-preview-resize-handle").realMouseUp(
      options,
    );

    cy.wait(["@updateSidebarWidth", "@sessionProperties"]);

    cy.findByTestId("native-query-preview-sidebar").then(($sidebar) => {
      const sidebarWidth = $sidebar[0].getBoundingClientRect().width;
      cb(initialSidebarWidth, sidebarWidth);
    });
  });
}

function openSidebar(variant: "sql" | "native" = "sql") {
  const label = variant === "sql" ? "View SQL" : "View native query";
  cy.findByLabelText(label).should("be.visible").click();
}

function closeSidebar(variant: "sql" | "native" = "sql") {
  const label = variant === "sql" ? "Hide SQL" : "Hide native query";
  cy.findByLabelText(label).should("be.visible").click();
}
