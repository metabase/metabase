const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > visualizations > table", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/field/*/search/*").as("findSuggestions");
  });

  function joinTable(table) {
    cy.findByText("Join data").click();
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", "Sample Database", table] });
  }

  function selectFromDropdown(option, clickOpts) {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().findByText(option).click(clickOpts);
  }

  it("should not be sortable when displays raw query results (metabase#19817)", () => {
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
    cy.findByLabelText("Switch to data").click();
    const initialColumnsOrder = ["Created At: Year", "Count"];

    H.assertTableData({
      columns: initialColumnsOrder,
    });

    H.tableHeaderColumn("Count").as("countHeaderInPreview");
    H.moveDnDKitElementByAlias("@countHeaderInPreview", { horizontal: -100 });

    H.assertTableData({
      columns: initialColumnsOrder,
    });

    H.notebookButton().click();

    cy.findAllByTestId("step-preview-button").eq(1).click();

    H.assertTableData({
      columns: initialColumnsOrder,
    });

    H.tableHeaderColumn("Count").as("countHeaderInNotebook");
    H.moveDnDKitElementByAlias("@countHeaderInNotebook", { horizontal: -100 });

    H.assertTableData({
      columns: initialColumnsOrder,
    });
  });

  it("should allow changing column title when the field ref is the same except for the join-alias", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.openOrdersTable({ mode: "notebook" });
    joinTable("Orders");
    selectFromDropdown("ID");
    selectFromDropdown("User ID");
    H.visualize();

    // Rename the first ID column, and make sure the second one is not updated
    H.tableHeaderClick("ID");
    H.popover().within(() => {
      cy.findByText("Filter by this column");
      cy.icon("gear").click();
      cy.findByLabelText("Column title").type(" updated");
      // This defocuses the input, which triggers the update
      cy.findByText("Column title").click();
    });

    cy.realPress("Escape");
    headerCells().findAllByText("ID updated").should("have.length", 1);
  });

  it("should allow selecting cells in a table and copy the values", () => {
    H.grantClipboardPermissions();

    H.openOrdersTable();

    const getNonPKCells = () =>
      H.tableInteractiveBody().find(
        '[data-selectable-cell]:not([data-column-id="ID"])',
      );

    const assertSelectedCells = (expectedCount) => {
      H.tableInteractiveBody()
        .find("[data-selectable-cell]")
        .filter('[aria-selected="true"]')
        .should("have.length", expectedCount);
    };

    // Single cell selection by clicking
    getNonPKCells().first().as("firstCell");
    cy.get("@firstCell").click();
    cy.get("@firstCell").should("have.attr", "aria-selected", "true");

    // Multi-cell selection by dragging
    getNonPKCells().eq(0).as("startCell");
    getNonPKCells().eq(3).as("endCell");

    cy.get("@startCell")
      .trigger("mousedown", { which: 1 })
      .then(() => {
        cy.get("@endCell").trigger("mouseover", { buttons: 1 });
        cy.get("@endCell").trigger("mouseup");
      });
    assertSelectedCells(4);

    // Cmd+click to add cells to selection
    getNonPKCells().eq(5).as("cmdClickCell");
    cy.get("@cmdClickCell").click({ metaKey: true });
    assertSelectedCells(5);

    // Shift+click for range selection
    getNonPKCells().eq(4).click();
    getNonPKCells().eq(6).click({ shiftKey: true });
    assertSelectedCells(3);

    // Copy formatted content with Cmd+C
    cy.realPress(["Meta", "c"]);
    H.readClipboard().should(
      "equal",
      "Total	Discount ($)	Created At\n39.72		February 11, 2025, 9:40 PM",
    );

    // Copy unformatted content with Shift+Cmd+C
    cy.realPress(["Shift", "Meta", "c"]);
    H.readClipboard().should(
      "equal",
      "Total	Discount ($)	Created At\n" +
        "39.718145389078366	null	2025-02-11T21:40:27.892-08:00",
    );

    // Escape to clear selection
    cy.realPress("Escape");
    assertSelectedCells(0);

    // Click outside to clear selection
    getNonPKCells().eq(0).click();
    // Click outside the table
    H.queryBuilderHeader().findByText("Orders").click();
    assertSelectedCells(0);
  });

  it("should allow enabling row index column", () => {
    H.openOrdersTable();
    H.openVizSettingsSidebar();
    H.sidebar().findByText("Show row index").click();

    H.openObjectDetail(5);

    // Ensure click on row index opens the object detail
    H.modal().findAllByText("6").should("have.length", 2).and("be.visible");

    // Close object detail modal
    cy.realType("{esc}");

    H.sidebar().findByText("Show row index").click();

    H.tableInteractive()
      .findAllByTestId("row-id-cell")
      .eq(5)
      .should("not.have.text", "6");
  });

  it("should allow you to reorder and hide columns in the table header", () => {
    H.startNewNativeQuestion({ query: "select * from orders LIMIT 2" });
    cy.findByTestId("native-query-editor-container").icon("play").click();

    H.openVizSettingsSidebar();

    cy.findByTestId(/subtotal-hide-button/i).click();
    cy.findByTestId(/tax-hide-button/i).click();
    cy.findByTestId("sidebar-left").findByText("Done").click();

    headerCells().eq(3).should("contain.text", "TOTAL");
    H.tableHeaderColumn("TOTAL").as("dragElement");
    H.moveDnDKitElementByAlias("@dragElement", { horizontal: -220 });
    headerCells().eq(1).should("contain.text", "TOTAL");

    H.tableHeaderClick("QUANTITY");
    H.popover().icon("eye_crossed_out").click();

    headerCells().contains("QUANTITY").should("not.exist");
  });

  it("should preserve set widths after reordering (VIZ-439)", () => {
    cy.intercept(
      "GET",
      "/api/search?models=dataset&models=table&table_db_id=*",
    ).as("getSearchResults");
    cy.intercept("POST", "/api/dataset").as("getDataset");
    H.startNewNativeQuestion({
      query: 'select 1 "first_column", 2 "second_column"',
      display: "table",
      visualization_settings: { "table.column_widths": [600, 150] },
    });

    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.wait(["@getSearchResults", "@getDataset"]);

    H.tableHeaderColumn("first_column").invoke("outerWidth").as("firstWidth");
    H.tableHeaderColumn("second_column").invoke("outerWidth").as("secondWidth");

    H.tableHeaderColumn("first_column").as("dragElement");
    H.moveDnDKitElementByAlias("@dragElement", {
      horizontal: 100,
    });

    const assertUnchangedWidths = () => {
      cy.get("@firstWidth").then((firstWidth) => {
        H.tableHeaderColumn("first_column")
          .invoke("outerWidth")
          .should("eq", firstWidth);
      });

      cy.get("@secondWidth").then((secondWidth) => {
        H.tableHeaderColumn("second_column")
          .invoke("outerWidth")
          .should("eq", secondWidth);
      });
    };

    assertUnchangedWidths();
    cy.reload();

    cy.findByTestId("native-query-editor-container").icon("play").click();
    // Wait for column widths to be set
    cy.wait(["@getSearchResults", "@getDataset"]);
    H.tableHeaderColumn("first_column").should("be.visible");
    assertUnchangedWidths();
  });

  it("should allow to display any column as link with extrapolated url and text", () => {
    H.openPeopleTable({ limit: 2 });

    H.tableHeaderClick("City");

    H.popover().within(() => {
      cy.icon("gear").click();
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Link").click();

    cy.findByLabelText("Link text").type("{{C");
    cy.findByTestId("select-list").within(() => {
      cy.findAllByText("CITY").click();
    });

    cy.findByLabelText("Link text")
      .type(" {{ID}} fixed text", {
        parseSpecialCharSequences: false,
      })
      .blur();

    cy.findByLabelText("Link URL")
      .type("http://metabase.com/people/{{ID}}", {
        parseSpecialCharSequences: false,
      })
      .blur();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Wood River 1 fixed text").should(
      "have.attr",
      "href",
      "http://metabase.com/people/1",
    );
  });

  it("should show field metadata in a hovercard when hovering over a table column header", () => {
    const ccName = "Foo";

    H.openPeopleTable({ mode: "notebook", limit: 2 });

    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "concat([Name], [Name])",
      name: ccName,
    });

    H.expressionEditorWidget().button("Done").click();

    cy.findByTestId("fields-picker").click();
    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.findByText("City").click();
      cy.findByText("State").click();
      cy.findByText("Birth Date").click();
      cy.findByText("Latitude").click();
    });

    // Click anywhere else to close the popover which is blocking the Visualize button
    cy.findByTestId("query-builder-root").click(0, 0);

    H.visualize();

    [
      [
        "ID",
        () => {
          // semantic type
          cy.contains("Entity Key");
          // description
          cy.contains("A unique identifier given to each user.");
        },
      ],
      [
        "City",
        () => {
          // semantic type
          cy.contains("City");
          // description
          cy.findByText("The city of the account’s billing address");
          // fingerprint
          cy.findByText("1,966 distinct values");
        },
      ],
      [
        "State",
        () => {
          // semantic type
          cy.contains("State");
          // fingerprint
          cy.findByText("49 distinct values");
          cy.contains("AK, AL, AR");
        },
      ],
      [
        "Birth Date",
        () => {
          // semantic type
          cy.contains("No special type");
          // fingerprint
          cy.findByText("Timezone");
          cy.findByText("April 26, 1958, 12:00 AM");
          cy.findByText("April 3, 2000, 12:00 AM");
        },
      ],
      [
        "Latitude",
        () => {
          // semantic type
          cy.contains("Latitude");
          // fingerprint
          cy.contains("39.88");
          cy.findByText("25.78");
          cy.findByText("70.64");
        },
      ],
      [
        ccName,
        () => {
          // semantic type
          cy.contains("No special type");
          // description
          cy.findByText("No description");
        },
      ],
    ].forEach(([column, test]) => {
      cy.get("[data-testid=cell-data]").contains(column).trigger("mouseover");

      // Add a delay here because there can be two popovers active for a very short time.
      cy.wait(250);

      H.hovercard().within(() => {
        test();
      });

      cy.get("[data-testid=cell-data]").contains(column).trigger("mouseout");
    });

    H.summarize();

    cy.findAllByTestId("dimension-list-item-name").contains(ccName).click();

    cy.wait("@dataset");

    cy.get("[data-testid=cell-data]").contains("Count").trigger("mouseover");
    H.hovercard().within(() => {
      cy.contains("Quantity");
      cy.findByText("No description");
    });
    cy.get("[data-testid=cell-data]").contains("Count").trigger("mouseout");

    // Make sure new table results loaded with Custom column and Count columns
    cy.get("[data-testid=cell-data]").contains(ccName).trigger("mouseover");
    cy.wait(250);

    H.hovercard().within(() => {
      cy.contains("No special type");
      cy.findByText("No description");
    });
  });

  it("should show the field metadata popover for a foreign key field (metabase#19577)", () => {
    H.openOrdersTable({ limit: 2 });

    cy.get("[data-testid=cell-data]")
      .contains("Product ID")
      .trigger("mouseover");

    H.hovercard().within(() => {
      cy.contains("Foreign Key");
      cy.contains("The product ID.");
    });
  });

  it("should show field metadata in a hovercard when hovering over a table column in the summarize sidebar", () => {
    H.openOrdersTable({ limit: 2 });

    H.summarize();

    cy.findAllByTestId("dimension-list-item")
      .contains("ID")
      .parents("[data-testid='dimension-list-item']")
      .within(() => {
        cy.findByLabelText("More info").realHover();
      });

    H.hovercard().within(() => {
      cy.contains("Entity Key");
    });
  });

  it("should show field metadata hovercards for native query tables", () => {
    H.startNewNativeQuestion({
      query: "select * from products limit 1",
      display: "table",
    });
    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.log("Wait for the table to load");
    cy.findAllByTestId("cell-data")
      .should("be.visible")
      .and("contain", "Gizmo");

    cy.log("Assert");
    cy.findAllByTestId("header-cell").filter(":contains(CATEGORY)").realHover();
    H.hovercard()
      .should("contain", "No special type")
      .and("contain", "No description");
  });

  it("should close the colum popover on subsequent click (metabase#16789)", () => {
    H.openPeopleTable({ limit: 2 });

    H.tableHeaderColumn("City").click();
    H.clickActionsPopover().should("be.visible");

    H.tableHeaderColumn("City").click();
    cy.wait(100); // Ensure popover is closed
    H.clickActionsPopover({ skipVisibilityCheck: true }).should("not.exist");
  });

  it("popover should not be scrollable horizontally (metabase#31339)", () => {
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

  it("should show the slow loading text when the query is taking too long", () => {
    H.openOrdersTable({ mode: "notebook" });

    cy.intercept("POST", "/api/dataset", (req) => {
      req.on("response", (res) => {
        res.setDelay(10000);
      });
    });

    cy.button("Visualize").click();

    cy.clock();
    cy.tick(1000);
    cy.findByTestId("query-builder-main").findByText("Doing science...");

    cy.tick(5000);
    cy.findByTestId("query-builder-main").findByText("Waiting for results...");
  });

  it("should support 'Local symbol' in 'Currency label style' viz setting", () => {
    H.openOrdersTable();

    H.tableHeaderClick("Discount ($)");
    H.popover().icon("gear").click();
    cy.findByLabelText("Unit of currency").click();
    cy.findByRole("option", { name: "New Zealand Dollar" }).click();
    H.tableHeaderColumn("Discount (NZ$)").should("be.visible");
    H.tableInteractive().findByText("6.42").should("be.visible");

    H.popover().findByText("Local symbol ($)").should("be.visible").click();
    H.tableHeaderColumn("Discount ($)").should("be.visible");
    H.tableInteractive().findByText("6.42").should("be.visible");

    H.popover().findByText("In every table cell").click();
    H.tableHeaderColumn("Discount").should("be.visible");
    H.tableInteractive().findByText("$6.42").should("be.visible");

    cy.log(
      "should still show the option if it's already selected but currency does not support it",
    );
    cy.findByLabelText("Unit of currency").click();
    cy.findByRole("option", { name: "US Dollar" }).click();
    H.popover().findByText("Local symbol ($)").should("be.visible");

    cy.log("but should hide it once a valid option is selected");
    H.popover().findByText("Symbol ($)").click();
    H.popover().findByText("Local symbol ($)").should("not.exist");
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

  it("should allow enabling pagination in dashcard viz settings", () => {
    // Page rows count is based on the available space which can differ depending on the platform and scroll bar system settings
    const rowsRegex = /Rows \d+-\d+ of first 2,000/;
    const idCellSelector = '[data-column-id="ID"]';
    const firstPageId = 6;
    const secondPageId = 12;

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.dashboardCards()
      .eq(0)
      .as("tableDashcard")
      .findByText(rowsRegex)
      .should("not.exist");

    cy.get("@tableDashcard").findByText("Showing first 2,000 rows");

    // Enable pagination
    H.editDashboard();
    H.showDashcardVisualizationSettings(0);
    H.modal().within(() => {
      cy.findByText("Paginate results").click();
      cy.findByText(rowsRegex);
      cy.button("Done").click();
    });

    H.saveDashboard();

    // Ensure pagination works
    cy.get("@tableDashcard").findByText(rowsRegex);
    cy.get(idCellSelector).should("contain", firstPageId);
    cy.get(idCellSelector).should("not.contain", secondPageId);

    cy.findByLabelText("Next page").click();
    cy.get("@tableDashcard").findByText(rowsRegex);
    cy.get(idCellSelector).should("contain", secondPageId);
    cy.get(idCellSelector).should("not.contain", firstPageId);

    cy.findByLabelText("Previous page").click();
    cy.get("@tableDashcard").findByText(rowsRegex);
    cy.get(idCellSelector).should("contain", firstPageId);
    cy.get(idCellSelector).should("not.contain", secondPageId);

    H.editDashboard();

    // Ensure resizing change page size
    H.resizeDashboardCard({ card: cy.get("@tableDashcard"), x: 600, y: 700 });
    H.saveDashboard();
    cy.get("@tableDashcard")
      .findByText(rowsRegex)
      .scrollIntoView()
      .should("be.visible");
    // Table got taller so elements from the second page have become visible
    cy.get(idCellSelector).should("contain", secondPageId);
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

          // Verify rows don't overlap by checking their bounding rects
          H.tableInteractive()
            .find("[role=row]")
            .then(($rows) => {
              const rects = $rows
                .toArray()
                .map((row) => row.getBoundingClientRect())
                .sort((a, b) => a.top - b.top);

              // Each row's top should equal the previous row's bottom (no overlap)
              for (let i = 1; i < rects.length; i++) {
                expect(rects[i].top).to.equal(rects[i - 1].bottom);
              }
            });

          // Sort again (descending) to verify heights update on subsequent sorts
          H.tableHeaderClick("Rating");

          H.tableInteractive()
            .find("[role=row]")
            .then(($rows) => {
              const rects = $rows
                .toArray()
                .map((row) => row.getBoundingClientRect())
                .sort((a, b) => a.top - b.top);

              for (let i = 1; i < rects.length; i++) {
                expect(rects[i].top).to.equal(rects[i - 1].bottom);
              }
            });
        });
    });
  });

  it("should support the row index setting", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.findByLabelText("Show visualization options").click();
      });
    H.modal().findByText("Show row index").click();

    cy.button("Done").click();

    H.saveDashboard();

    H.tableInteractiveBody()
      .findAllByTestId("row-id-cell")
      .eq(0)
      .should("have.text", 1);

    // Apply sorting to ensure row index does not change
    H.tableHeaderClick("ID");

    H.tableInteractiveBody()
      .findAllByTestId("row-id-cell")
      .eq(0)
      .should("have.text", 1);
  });

  it("should expand columns to the full width of the dashcard (metabase#57381)", () => {
    const sideColumnsWidth = 200;
    const expandedSideColumnsWidth = 2 * sideColumnsWidth;
    const idColumnWidth = 54;
    const idExpandedWidth = 2 * idColumnWidth;

    H.createQuestionAndDashboard({
      questionDetails: {
        name: "reviews",
        type: "model",
        query: {
          "source-table": SAMPLE_DATABASE.REVIEWS_ID,
        },
        visualization_settings: {
          "table.column_widths": [sideColumnsWidth, null, sideColumnsWidth], // middle column width is not set
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
              enabled: false,
            },
            {
              name: "ID",
              enabled: true,
            },
            {
              name: "PRODUCT_ID",
              enabled: false,
            },
            {
              name: "REVIEWER",
              enabled: false,
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
      H.visitDashboard(dashboard_id);

      // Column widths should be expanded to the full width of the dashcard
      H.getColumnWidth("Body").should("be.gt", expandedSideColumnsWidth);
      H.getColumnWidth("Rating").should("be.gt", expandedSideColumnsWidth);
      H.getColumnWidth("ID").should("be.gt", idExpandedWidth);

      // Resize Body column
      H.resizeTableColumn("BODY", -100);

      // Ensure columns are not expanded to the full width of the dashcard after manual resizing
      H.getColumnWidth("Body")
        .should("be.gt", expandedSideColumnsWidth - 100)
        .should("be.lt", expandedSideColumnsWidth);
      H.getColumnWidth("Rating").should("be.gt", expandedSideColumnsWidth);
      H.getColumnWidth("ID").should("be.gt", idExpandedWidth);
    });
  });

  it("should support resizing columns in dashcard viz settings", () => {
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
  });
});

describe("scenarios > visualizations > table > conditional formatting", () => {
  describe("rules", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": SAMPLE_DATABASE.ORDERS_ID,
          },
          type: "query",
        },
        visualization_settings: {
          "table.column_formatting": [
            {
              id: 0,
              type: "single",
              operator: "<",
              value: 3,
              color: "#509EE3",
              highlight_row: false,
              columns: ["TAX"],
            },
            {
              id: 1,
              type: "single",
              operator: "<",
              value: 6,
              color: "#88BF4D",
              highlight_row: false,
              columns: ["TAX"],
            },
            {
              id: 2,
              type: "single",
              operator: "<",
              value: 10,
              color: "#EF8C8C",
              highlight_row: false,
              columns: ["TAX"],
            },
          ],
        },
      });

      H.openVizSettingsSidebar();
      H.sidebar().findByText("Conditional Formatting").click();
    });

    it("should be able to remove, add, and re-order rows", () => {
      cy.findAllByTestId("formatting-rule-preview")
        .first()
        .should("contain.text", "is less than 3");
      cy.findAllByTestId("formatting-rule-preview")
        .first()
        .findByRole("img", { name: /close/ })
        .click();

      cy.findAllByTestId("formatting-rule-preview")
        .first()
        .should("contain.text", "is less than 6");

      cy.findByRole("button", { name: /add a rule/i }).click();
      // popover should open automatically
      H.popover().findByText("Subtotal").click();
      cy.realPress("Escape");
      cy.findByTestId("conditional-formatting-value-operator-button").click({
        force: true,
      });
      H.popover().findByText("is less than").click();

      cy.findByTestId("conditional-formatting-value-input").type("20");
      cy.findByTestId("conditional-formatting-color-selector").click();

      H.popover()
        .findByRole("button", { name: /#F2A86F/i })
        .click();

      cy.button("Add rule").click();

      cy.findAllByTestId("formatting-rule-preview")
        .first()
        .should("contain.text", "is less than 20");

      cy.findAllByTestId("formatting-rule-preview").eq(2).as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: -300,
      });

      cy.findAllByTestId("formatting-rule-preview")
        .first()
        .should("contain.text", "is less than 10");
    });
  });

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
          const booleanField = fields.find((field) => field.name === "boolean");
          const stringField = fields.find((field) => field.name === "string");
          const idField = fields.find((field) => field.name === "id");

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

      cy.findByRole("gridcell", { name: "true" }).should(
        "have.css",
        "background-color",
        "rgba(80, 158, 227, 0.65)",
      );
    });
  });
});

describe("scenarios > visualizations > table > time formatting (#11398)", () => {
  const singleTimeQuery = `
      WITH t1 AS (SELECT TIMESTAMP '2023-01-01 18:34:00' AS time_value),
           t2 AS (SELECT CAST(time_value AS TIME) AS creation_time
                  FROM t1)
      SELECT *
      FROM t2;
  `;

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should work with time columns", { tags: ["@external"] }, () => {
    H.createNativeQuestion(
      {
        name: "11398",
        native: {
          query: singleTimeQuery,
        },
      },
      { visitQuestion: true },
    );

    // Open the formatting menu
    H.tableHeaderClick("CREATION_TIME");

    H.popover().icon("gear").click();

    cy.findByTestId("column-formatting-settings").within(() => {
      // Set to hours, minutes, seconds, 24-hour clock
      cy.findByText("HH:MM:SS").click();
      cy.findByText("17:24 (24-hour clock)").click();
    });

    // And you should find the result
    cy.findByRole("gridcell").findByText("18:34:00");

    cy.findByTestId("column-formatting-settings").within(() => {
      // Add millisecond display and change back to 12 hours
      cy.findByText("HH:MM:SS.MS").click();
      cy.findByText("5:24 PM (12-hour clock)").click();
    });

    // And you should find the result
    cy.findByRole("gridcell").findByText("6:34:00.000 PM");
  });
});

function headerCells() {
  return cy.findAllByTestId("header-cell");
}

function assertClientSideTableSorting({
  columnName,
  columnId,
  descValue,
  ascValue,
  defaultValue,
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
    defaultValue: 1,
    descValue: 2000,
    ascValue: 1,
  });

  assertClientSideTableSorting({
    columnName: "Created At",
    columnId: "CREATED_AT",
    defaultValue: "February 11, 2025, 9:40 PM",
    descValue: "April 19, 2026, 2:07 PM",
    ascValue: "June 1, 2022, 6:12 PM",
  });
}
