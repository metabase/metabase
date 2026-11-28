const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { Field } from "metabase-types/api";

describe("scenarios > visualizations > table", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("popover should not be scrollable horizontally (metabase#31339)", () => {
    cy.intercept("GET", "/api/field/*/search/*").as("findSuggestions");
    H.openPeopleTable();
    H.tableHeaderClick("Password");

    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Is");
    H.popover().within(() => {
      cy.findByPlaceholderText("Search by Password").type("e");
      cy.wait("@findSuggestions");
      cy.findByPlaceholderText("Search by Password").blur();
    });

    H.popover().then(($popover) => {
      expect(H.isScrollableHorizontally($popover[0])).to.be.false;
    });
  });
});

describe("scenarios > visualizations > table > dashboards context", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow viewing data in dashboards", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    // Ensure it works on a regular dashboard
    assertCanViewOrdersTableDashcard();

    // Ensure it works on a public dashboard
    H.openSharingMenu("Create a public link");
    cy.findByTestId("public-link-input")
      .invoke("val")
      .should("not.be.empty")
      .then((publicLink) => {
        cy.signOut();
        cy.visit(publicLink);
      });

    assertCanViewOrdersTableDashcard();
  });

  it("should support text wrapping setting", () => {
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "reviews",
        type: "model",
        query: {
          "source-table": SAMPLE_DATABASE.REVIEWS_ID,
        },
        visualization_settings: {
          "table.column_widths": [246, 195, 69, 116, 134, 83],
          column_settings: {
            '["name","BODY"]': {
              text_wrapping: true,
            },
          },
          "table.columns": [
            {
              name: "BODY",
              enabled: true,
            },
            {
              name: "CREATED_AT",
              enabled: true,
            },
            {
              name: "ID",
              enabled: true,
            },
            {
              name: "PRODUCT_ID",
              enabled: true,
            },
            {
              name: "REVIEWER",
              enabled: true,
            },
            {
              name: "RATING",
              enabled: true,
            },
          ],
        },
      },
      dashboardDetails: {
        name: "Dashboard",
      },
      cardDetails: {
        size_x: 24,
        size_y: 12,
      },
    }).then(({ body: { dashboard_id } }) => {
      const wrappedRowInitialHeight = 87;
      const updatedRowHeight = 70;
      H.visitDashboard(dashboard_id);

      H.assertRowHeight(0, wrappedRowInitialHeight);

      H.resizeTableColumn("BODY", 100);

      // Ensure resizing led to the reduction of the row height
      H.assertRowHeight(0, updatedRowHeight);

      // Ensure resizing did not permanently changed the row height
      cy.reload();
      H.closeNavigationSidebar();
      H.assertRowHeight(0, wrappedRowInitialHeight);

      // Disable text wrapping from dashcard settings
      H.editDashboard();

      H.getDashboardCard(0)
        .realHover()
        .within(() => {
          cy.findByLabelText("Show visualization options").click();
        });

      cy.findByTestId("Body-settings-button").click();

      H.popover().findByText("Wrap text").click();

      cy.button("Done").click();

      // Ensure rows have fixed default height
      H.assertRowHeight(0, 36);
    });
  });

  it("should update row heights correctly when sorting with text wrapping enabled (metabase#61164)", () => {
    // This test verifies that when sorting changes, row heights are recalculated
    // based on the new row content at each position (not the old cached heights)
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "reviews for sorting test",
        type: "model",
        query: {
          "source-table": SAMPLE_DATABASE.REVIEWS_ID,
          limit: 10,
        },
        visualization_settings: {
          "table.column_widths": [200, 100, 100, 100, 100],
          column_settings: {
            '["name","BODY"]': {
              text_wrapping: true,
            },
          },
          "table.columns": [
            {
              name: "BODY",
              enabled: true,
            },
            {
              name: "RATING",
              enabled: true,
            },
            {
              name: "ID",
              enabled: true,
            },
            {
              name: "PRODUCT_ID",
              enabled: true,
            },
            {
              name: "REVIEWER",
              enabled: true,
            },
          ],
        },
      },
      dashboardDetails: {
        name: "Dashboard",
      },
      cardDetails: {
        size_x: 24,
        size_y: 12,
      },
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);

      // Wait for table to render, then sort and verify rows don't overlap
      H.tableInteractive()
        .find("[data-index=0]")
        .should("exist")
        .then(() => {
          H.tableHeaderClick("Rating");
          H.tableHeaderColumn("Rating")
            .closest("[role=columnheader]")
            .findByLabelText("chevrondown icon");

          // Verify rows don't overlap by checking their bounding rects
          H.tableInteractiveBody()
            .find("[role=row]")
            .should(($rows) => {
              const rects = $rows
                .toArray()
                .map((row) => row.getBoundingClientRect())
                .sort((a, b) => a.top - b.top);

              // Each row's top should equal the previous row's bottom (no overlap)
              for (let i = 1; i < rects.length; i++) {
                expect(rects[i].top).to.be.closeTo(rects[i - 1].bottom, 0.001);
              }
            });

          // Sort again (ascending) to verify heights update on subsequent sorts
          H.tableHeaderClick("Rating");
          H.tableHeaderColumn("Rating")
            .closest("[role=columnheader]")
            .findByLabelText("chevronup icon");

          H.tableInteractiveBody()
            .find("[role=row]")
            .should(($rows) => {
              const rects = $rows
                .toArray()
                .map((row) => row.getBoundingClientRect())
                .sort((a, b) => a.top - b.top);

              for (let i = 1; i < rects.length; i++) {
                expect(rects[i].top).to.be.closeTo(rects[i - 1].bottom, 0.001);
              }
            });
        });
    });
  });

  it("should support resizing columns and the row index setting in dashcard viz settings", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.findAllByTestId("header-cell")
      .filter(":contains(ID)")
      .as("headerCell")
      .then(($cell) => {
        const originalWidth = $cell[0].getBoundingClientRect().width;
        cy.wrap(originalWidth).as("originalWidth");
      });

    H.editDashboard();

    H.getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.findByLabelText("Show visualization options").click();
      });

    const resizeByWidth = 100;
    H.resizeTableColumn("ID", resizeByWidth, 1);

    H.modal().findByText("Done").click();

    H.saveDashboard();

    cy.get("@originalWidth").then((originalWidth) => {
      cy.get("@headerCell").should(($newCell) => {
        const newWidth = $newCell[0].getBoundingClientRect().width;
        expect(newWidth).to.be.gte(originalWidth + resizeByWidth);
      });
    });

    // Ensure it persists after page reload
    cy.reload();

    cy.get("@originalWidth").then((originalWidth) => {
      cy.get("@headerCell").should(($newCell) => {
        const newWidth = $newCell[0].getBoundingClientRect().width;
        expect(newWidth).to.be.gte(originalWidth + resizeByWidth);
      });
    });

    cy.log("row index setting");
    H.editDashboard();

    H.getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.findByLabelText("Show visualization options").click();
      });
    H.modal().findByText("Display").click();
    H.modal().findByText("Show row index").click();

    cy.button("Done").click();

    H.saveDashboard();

    H.tableInteractiveBody()
      .findAllByTestId("row-id-cell")
      .eq(0)
      .should("have.text", "1");
  });
});

describe("scenarios > visualizations > table > conditional formatting", () => {
  describe("operators", () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_data_types" });
      cy.signInAsAdmin();
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: "many_data_types",
      });

      H.getTable({ name: "many_data_types" }).then(
        ({ id: tableId, fields }) => {
          const booleanField = fields.find(
            (field: Field) => field.name === "boolean",
          );
          const stringField = fields.find(
            (field: Field) => field.name === "string",
          );
          const idField = fields.find((field: Field) => field.name === "id");

          H.visitQuestionAdhoc({
            dataset_query: {
              database: WRITABLE_DB_ID,
              query: {
                "source-table": tableId,
                fields: [
                  ["field", idField.id, { "base-type": idField["base_type"] }],
                  [
                    "field",
                    stringField.id,
                    { "base-type": stringField["base_type"] },
                  ],
                  [
                    "field",
                    booleanField.id,
                    { "base-type": booleanField["base_type"] },
                  ],
                ],
              },
              type: "query",
            },
            display: "table",
          });
        },
      );
    });

    it("should work with boolean columns", { tags: ["@external"] }, () => {
      H.openVizSettingsSidebar();
      H.leftSidebar().findByText("Conditional Formatting").click();
      cy.findByRole("button", { name: /add a rule/i }).click();

      H.popover().findByRole("option", { name: "Boolean" }).click();

      //Dismiss popover
      H.leftSidebar().findByText("Which columns should be affected?").click();

      //Check that is-true was applied by default to boolean field rule
      cy.findByTestId("conditional-formatting-value-operator-button").should(
        "have.value",
        "is true",
      );

      H.tableInteractiveBody()
        .findByRole("gridcell", { name: "true" })
        .findByTestId("body-cell-container")
        .should("have.css", "background-color", "rgba(80, 158, 227, 0.65)");
    });
  });
});

describe("scenarios > visualizations > table > with tracking", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should track when freeze columns and freeze rows are enabled from viz settings", () => {
    H.openOrdersTable();
    H.openVizSettingsSidebar();
    H.sidebar().findByText("Display").click();

    H.sidebar().findByText("Freeze columns").click();

    // Toggling off should not emit the enabled event again
    H.sidebar().findByText("Freeze columns").click();
    H.expectUnstructuredSnowplowEvent(
      {
        event: "table_freeze_columns_enabled",
        triggered_from: "viz_settings",
      },
      1,
    );

    H.sidebar().findByText("Freeze rows").click();

    // Toggling off should not emit the enabled event again
    H.sidebar().findByText("Freeze rows").click();
    H.expectUnstructuredSnowplowEvent(
      {
        event: "table_freeze_rows_enabled",
        triggered_from: "viz_settings",
      },
      1,
    );
  });
});

function assertClientSideTableSorting({
  columnName,
  columnId,
  descValue,
  ascValue,
  defaultValue,
}: {
  columnName: string;
  columnId: string;
  descValue: string;
  ascValue: string;
  defaultValue: string;
}) {
  H.tableInteractiveScrollContainer().scrollTo("topLeft");

  const cellSelector = `[data-column-id=${columnId}]`;

  H.tableInteractiveBody()
    .findAllByRole("row")
    .first()
    .find(cellSelector)
    .should("have.text", defaultValue);

  // Descending sorting by ID
  H.tableHeaderClick(columnName);
  H.tableHeaderColumn(columnName)
    .closest("[role=columnheader]")
    .findByLabelText("chevrondown icon");
  H.tableInteractiveBody()
    .findAllByRole("row")
    .first()
    .find(cellSelector)
    .should("have.text", descValue);

  // Ascending sorting by ID
  H.tableHeaderClick(columnName);
  H.tableHeaderColumn(columnName)
    .closest("[role=columnheader]")
    .findByLabelText("chevronup icon");
  H.tableInteractiveBody()
    .findAllByRole("row")
    .first()
    .find(cellSelector)
    .should("have.text", ascValue);

  // Default sorting by ID
  H.tableHeaderClick(columnName);
  H.tableHeaderColumn(columnName)
    .closest("[role=columnheader]")
    .findByRole("img")
    .should("not.exist");
  H.tableInteractiveBody()
    .findAllByRole("row")
    .first()
    .find(cellSelector)
    .should("have.text", defaultValue);
}

function assertCanViewOrdersTableDashcard() {
  H.assertTableRowsCount(2000);
  H.tableInteractiveScrollContainer().scrollTo("bottomLeft");

  // Ensure it renders correct data
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.tableInteractiveBody()
    .findAllByRole("row")
    .last()
    .findAllByRole("gridcell")
    .eq(0)
    .should("have.text", "2000"); // Last Order ID

  H.tableInteractiveScrollContainer().scrollTo("bottomRight");

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.tableInteractiveBody()
    .findAllByRole("row")
    .last()
    .findAllByRole("gridcell")
    .last()
    .should("have.text", "9"); // Quantity of the last Order

  // Ensure sorting works
  assertClientSideTableSorting({
    columnName: "ID",
    columnId: "ID",
    defaultValue: "1",
    descValue: "2000",
    ascValue: "1",
  });

  assertClientSideTableSorting({
    columnName: "Created At",
    columnId: "CREATED_AT",
    defaultValue: "February 11, 2028, 9:40 PM",
    descValue: "April 19, 2029, 2:07 PM",
    ascValue: "June 1, 2025, 6:12 PM",
  });
}
