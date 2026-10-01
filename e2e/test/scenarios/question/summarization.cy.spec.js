const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > summarize sidebar", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    H.visitQuestion(ORDERS_QUESTION_ID);
    H.summarize();
  });

  it("selected dimensions become pinned to the top of the dimensions list (with the table alias for another table), and removing all aggregations shows the add aggregation button", () => {
    H.getDimensionByName({ name: "Total" })
      .should("have.attr", "aria-selected", "false")
      .click({ position: "left" });

    H.getDimensionByName({ name: "Total" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );

    cy.button("Done").click();

    H.summarize();

    // Removed from the unpinned list
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total").should("not.exist");
    });

    // Displayed in the pinned list
    cy.findByTestId("pinned-dimensions").within(() => {
      cy.findByText("Orders → Total").should("not.exist");
      H.getDimensionByName({ name: "Total" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    H.getRemoveDimensionButton({ name: "Total" }).click();

    // Becomes visible in the unpinned list again
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total");
    });

    H.getDimensionByName({ name: "State" }).click();

    cy.button("Done").click();

    H.summarize();

    cy.findByTestId("pinned-dimensions").within(() => {
      H.getDimensionByName({ name: "User → State" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    H.getRemoveDimensionButton({ name: "User → State" }).click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User → State").should("not.exist");

    cy.findByTestId("aggregation-item").within(() => {
      cy.icon("close").click();
    });

    cy.findByTestId("add-aggregation-button").should(
      "have.text",
      "Add a function or metric",
    );
  });

  it("selecting a binning adds a dimension", () => {
    H.getDimensionByName({ name: "Total" }).click({ position: "left" });

    H.changeBinningForDimension({
      name: "Quantity",
      toBinning: "10 bins",
    });

    H.getDimensionByName({ name: "Total" })
      .scrollIntoView()
      .should("have.attr", "aria-selected", "true")
      .findByLabelText("Binning strategy")
      .should("be.visible");
    H.getDimensionByName({ name: "Quantity" })
      .should("have.attr", "aria-selected", "true")
      .findByLabelText("Binning strategy")
      .should("be.visible");
    H.getDimensionByName({ name: "Discount" }).within(() => {
      cy.button("Add dimension").realHover();
      cy.findByLabelText("Binning strategy").should("be.visible");
    });
  });

  it("should only have one scrollbar for the summarize sidebar and not show the run button overlay when an error occurs (metabase#45452, metabase#12586)", () => {
    cy.findByTestId("summarize-aggregation-item-list").then(($el) => {
      const element = $el[0];
      expectNoScrollbar(element);
    });

    cy.findByTestId("summarize-breakout-column-list").then(($el) => {
      const element = $el[0];
      expectNoScrollbar(element);
    });

    // the sidebar is the only element with a scrollbar
    cy.findByTestId("sidebar-content").then(($el) => {
      const element = $el[0];
      expect(element.scrollHeight > element.clientHeight).to.be.true;
      expect(element.offsetWidth > element.clientWidth).to.be.true;
    });

    cy.intercept("POST", "/api/dataset", (req) => req.destroy());

    H.rightSidebar().button("Done").click();
    H.main()
      .findByText("We're experiencing server issues")
      .should("be.visible");
    cy.findByTestId("query-builder-main").icon("play").should("not.be.visible");
  });
});

describe("scenarios > question > summarize", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("summarizing by distinct datetime should allow granular selection (metabase#13098)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.summarize({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Number of distinct values of ...").click();
      cy.findByLabelText("Temporal bucket").realHover().click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover()
      .last()
      .within(() => {
        cy.button("More…").click();
        cy.findByText("Hour of day").click();
      });

    H.getNotebookStep("summarize")
      .findByText("Distinct values of Created At: Hour of day")
      .should("be.visible");
  });

  it("should handle (removing) multiple metrics when one is sorted (metabase#12625)", () => {
    H.createTestQuery({
      database: SAMPLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [
            { type: "operator", operator: "count" },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "SUBTOTAL" }],
            },
            {
              type: "operator",
              operator: "sum",
              args: [{ type: "column", name: "TOTAL" }],
            },
          ],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              sourceName: "ORDERS",
              unit: "year",
            },
          ],
          orderBys: [
            {
              direction: "desc",
              type: "column",
              name: "sum",
              displayName: "Sum of Subtotal",
            },
          ],
        },
      ],
    })
      .then((dataset_query) => H.createCard({ name: "12625", dataset_query }))
      .then((card) => H.visitQuestion(card.id));

    H.summarize();

    cy.findAllByTestId("header-cell").should("have.length", 4);
    H.tableHeaderColumn("Sum of Subtotal")
      .closest("[data-testid=header-cell]")
      .findByLabelText("chevrondown icon");

    cy.log('At this point only "Sum of Subtotal" should be sorted');
    H.tableInteractiveHeader("header-sort-indicator")
      .findAllByTestId("header-sort-indicator")
      .should("have.length", 1);

    cy.log("Remove the sorted metric");
    removeMetricFromSidebar("Sum of Subtotal");

    cy.log('"Sum of Total" should not be sorted, nor any other header cell');
    H.tableInteractiveHeader("header-sort-indicator")
      .findAllByTestId("header-sort-indicator")
      .should("have.length", 0);

    cy.findAllByTestId("header-cell")
      .should("have.length", 3)
      .and("not.contain", "Sum of Subtotal");

    removeMetricFromSidebar("Sum of Total");

    cy.findAllByTestId("header-cell").should("have.length", 2);
    cy.get("[data-testid=cell-data]").should("contain", 744); // `Count` for year 2025
  });
});

function removeMetricFromSidebar(metricName) {
  H.interceptIfNotPreviouslyDefined({
    method: "POST",
    url: "/api/dataset",
    alias: "dataset",
  });

  H.rightSidebar().within(() => {
    cy.findByLabelText(metricName)
      .find(".Icon-close")
      .should("be.visible")
      .click();
    cy.wait("@dataset");

    cy.findByLabelText(metricName).should("not.exist");
  });
}

function expectNoScrollbar(element) {
  const { borderLeftWidth, borderRightWidth } = getComputedStyle(element);
  const scrollbarWidth =
    element.offsetWidth -
    element.clientWidth -
    parseFloat(borderLeftWidth) -
    parseFloat(borderRightWidth);

  expect(scrollbarWidth).to.equal(0);
}
