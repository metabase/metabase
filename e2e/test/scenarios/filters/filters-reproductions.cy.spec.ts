import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

const { ORDERS_ID, PRODUCTS, ORDERS, REVIEWS, REVIEWS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

describe("issue 18770", () => {
  const questionDetails = {
    name: "18770",
    query: {
      "source-query": {
        aggregation: [["count"]],
        "source-table": ORDERS_ID,
        breakout: [
          ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("post-aggregation filter shouldn't affect the drill-through options (metabase#18770)", () => {
    H.openNotebook();
    // It is important to manually trigger "visualize" in order to generate the `result_metadata`
    // Otherwise, we might get false negative even when this issue gets resolved.
    // In order to do that, we have to change the breakout field first or it will never generate and send POST /api/dataset request.
    cy.findAllByTestId("notebook-cell-item")
      .contains(/Products? → Title/)
      .click();
    H.popover().findByText("Category").click();
    cy.findAllByTestId("notebook-cell-item").contains(/Products? → Category/);

    H.visualize();

    cy.findAllByTestId("cell-data")
      .filter(":contains(4,784)")
      .should("have.length", 1);

    // Querying the cell again to ensure the dom node stability
    H.tableInteractiveBody().findByText("4,784").click();
    H.popover().within(() => {
      cy.findByText("Filter by this value").should("be.visible");
      cy.findAllByRole("button")
        .should("have.length", 7)
        .and("contain", "See these Orders")
        .and("contain", "Break out by")
        .and("contain", "Copy value")
        .and("contain", "<")
        .and("contain", ">")
        .and("contain", "=")
        .and("contain", "≠");
    });
  });
});

describe("issue 49321", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should keep the popover width while typing (metabase#49321)", () => {
    H.openProductsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });

    H.popover().within(() => {
      cy.findByText("Title").click();
      cy.findByText("Is").click();
    });
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().findByText("Contains").click();

    H.popover().then(($popover) => {
      const { width } = $popover[0].getBoundingClientRect();
      cy.wrap(width).as("initialWidth");
    });

    H.popover()
      .findByPlaceholderText("Enter some text")
      .type("aaaaaaaaaa, bbbbbbbbbbb,");

    cy.get<number>("@initialWidth").then((initialWidth) => {
      H.popover().should(($popover) => {
        const { width } = $popover[0].getBoundingClientRect();
        expect(width).to.eq(initialWidth);
      });
    });
  });
});
describe("issue 45410", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not overflow the last filter value with the info icon (metabase#45410)", () => {
    H.openPeopleTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.clauseStepPopover().within(() => {
      cy.findByText("Email").click();
      cy.findByPlaceholderText("Search by Email")
        .type("abc@example.com,abc2@example.com")
        .blur();
      cy.findByText("abc2@example.com")
        .next("button")
        .then(([removeButton]) => {
          cy.icon("info").then(([infoIcon]) => {
            const removeButtonRect = removeButton.getBoundingClientRect();
            const infoIconRect = infoIcon.getBoundingClientRect();
            expect(removeButtonRect.right).to.be.lte(infoIconRect.left);
          });
        });
    });
  });
});

describe("issue 31340", () => {
  const LONG_COLUMN_NAME =
    "Some very very very very long column name that should have a line break";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("GET", `/api/field/${PEOPLE.PASSWORD}/search/*`).as("search");

    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
      fieldId: PEOPLE.PASSWORD,
    });

    H.DataModel.FieldSection.getNameInput()
      .focus()
      .clear()
      .type(LONG_COLUMN_NAME)
      .blur();
    cy.wait("@fieldUpdate");

    H.createQuestion(
      { query: { "source-table": PEOPLE_ID, limit: 2 } },
      { visitQuestion: true },
    );
  });

  it("should display long column names in search results (metabase#31340)", () => {
    H.tableHeaderClick(LONG_COLUMN_NAME);

    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Is");
    H.popover().within(() => {
      cy.findByPlaceholderText(`Search by ${LONG_COLUMN_NAME}`).type(
        "nonexistingvalue",
      );
      cy.wait("@search");
    });

    H.popover()
      .should("have.length", 2)
      .last()
      .findByText(`No matching ${LONG_COLUMN_NAME} found.`)
      .should("be.visible")
      .and(([message]) => {
        expect(message.scrollWidth).to.be.lte(message.clientWidth);
      });
  });
});

describe("issue 45252", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_data_types" });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "many_data_types" });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow using is-null and not-null operators with unsupported data types (metabase#45252,metabase#38111)", () => {
    H.startNewQuestion();

    cy.log("filter picker - new filter");
    H.miniPicker().within(() => {
      cy.findByText("Writable Postgres12").click();
      cy.findByText("Many Data Types").click();
    });
    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    H.popover().within(() => {
      cy.findByText("Binary").scrollIntoView().click();
      cy.findByLabelText("Is empty").click();
      cy.button("Add filter").click();
    });
    H.visualize();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(0);

    cy.log("filter picker - existing filter");
    cy.findByTestId("qb-filters-panel").findByText("Binary is empty").click();
    H.popover().within(() => {
      cy.findByLabelText("Not empty").click();
      cy.button("Update filter").click();
      cy.wait("@dataset");
    });
    cy.findByTestId("qb-filters-panel")
      .findByText("Binary is not empty")
      .should("be.visible");
    H.assertQueryBuilderRowCount(2);

    cy.log("filter picker - existing filter");
    H.queryBuilderHeader()
      .button(/Filter/)
      .click();
    H.popover().within(() => {
      cy.findByText("Binary").click();
      cy.findByLabelText("Is empty").click();
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(0);

    cy.log("filter picker - json column");
    H.queryBuilderFiltersPanel()
      .findByText("Binary is empty")
      .icon("close")
      .click();
    cy.wait("@dataset");
    H.queryBuilderHeader()
      .button(/Filter/)
      .click();
    H.popover().within(() => {
      cy.findByText("Jsonb").click();
      cy.findByLabelText("Not empty").click();
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(2);
  });
});

describe("issue 44435", () => {
  // It is crucial that the string is without spaces!
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const longString = alphabet.repeat(10);

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("filter pill should not overflow the window width when the filter string is very long (metabase#44435)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          fields: [
            ["field", REVIEWS.REVIEWER, { "base-type": "type/Text" }],
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
          ],
          filter: [
            "=",
            ["field", REVIEWS.BODY, { "base-type": "type/Text" }],
            longString,
          ],
        },
        parameters: [],
      },
    });

    cy.findByTestId("filter-pill").then(($pill) => {
      const pillWidth = $pill[0].getBoundingClientRect().width;
      cy.window().its("innerWidth").should("be.gt", pillWidth);
    });
  });
});

describe("Issue 48851", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.viewport(1050, 500);
  });

  const manyValues = Array(20)
    .fill(0)
    .map(() => Math.round(Math.random() * 1000_000_000_000).toString(36))
    .join(", ");

  it("should not overflow the filter popover, even when there are a lot of values (metabase#48851)", () => {
    H.openProductsTable();
    H.tableHeaderClick("Title");

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Is").click();
    });

    H.popover().eq(1).findByText("Contains").click();
    H.popover().should("have.length", 1);
    H.popover()
      .findByPlaceholderText("Enter some text")
      .type(manyValues, { force: true, timeout: 0 });

    H.popover().button("Add filter").should("be.visible");
  });
});

describe("issue 50731", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.viewport(800, 800);
  });

  it("tooltip content should not overflow the tooltip (metabase#50731)", () => {
    H.openOrdersTable();
    cy.icon("filter").click();
    cy.icon("label").realHover();

    H.popover()
      .should("be.visible")
      .and(($element) => {
        const [container] = $element;
        const descendants = container.querySelectorAll("*");

        descendants.forEach((descendant) => {
          H.assertDescendantNotOverflowsContainer(descendant, container);
        });
      });
  });
});

describe("issue 58923", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.viewport(800, 800);
  });

  it("it should not lose padding when switching filter types (metabase#58923)", () => {
    H.openPeopleTable();
    H.tableHeaderClick("Name");

    H.popover().findByText("Filter by this column").click();
    H.popover().findByText("Is").click();
    H.popover().should("have.length", 2).last().findByText("Contains").click();

    H.popover().findByText("Contains").click();
    H.popover().should("have.length", 2).last().findByText("Is").click();

    H.popover()
      .first()
      .within(() => {
        cy.findByPlaceholderText("Search by Name").then((input) => {
          cy.button("Add filter")
            .parent()
            .then((footer) => {
              const { bottom } = input[0].getBoundingClientRect();
              const { top } = footer[0].getBoundingClientRect();

              cy.wrap(top - bottom).should("be.gt", 16);
            });
        });
      });
  });
});

describe("issue QUE-1359", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render an outline on the custom expression item in the filter popover (QUE-1359)", () => {
    H.openReviewsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });

    Cypress._.times(10, () => cy.realPress("ArrowDown"));

    H.popover()
      .findByText("Custom Expression")
      .parent()
      .then((el) => {
        cy.wrap(window.getComputedStyle(el[0]).outline).should(
          "contain",
          "solid",
        );
      });
  });
});

describe("issue 14307", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("user shouldn't need to scroll to add filter (metabase#14307)", () => {
    cy.viewport(1280, 720);
    H.openPeopleTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().findByText("State").click({ force: true });
    H.popover().findByText("AL").click();
    cy.button("Add filter").isVisibleInPopover();
  });
});

describe("filter picker keyboard navigation", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render the selected item in view", () => {
    cy.viewport(1280, 320);
    H.openReviewsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });

    Cypress._.times(7, () => cy.realPress("ArrowDown"));

    H.popover()
      .findByRole("tree")
      .then((el) => {
        cy.wrap(el[0].scrollTop).should("be.greaterThan", 0);
      });

    H.popover().findByText("Created At").should("be.visible");
  });
});
