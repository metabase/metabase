import _ from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  createQuestion,
  describeWithSnowplow,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  expectGoodSnowplowEvent,
} from "e2e/support/helpers";

const { PEOPLE, PEOPLE_ID, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describeWithSnowplow("scenarios > visualizations > combine shortcut", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    resetSnowplow();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should be possible add a new column through the combine columns shortcut", () => {
    createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          limit: 1,
          fields: [
            ["field", PEOPLE.ID, null],
            ["field", PEOPLE.EMAIL, null],
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    combineColumns({
      columns: ["Email", "ID"],
      newColumn: "Combined Email, ID",
      example: "email@example.com12345",
      newValue: "borer-hudson@yahoo.com1",
    });

    expectGoodSnowplowEvent({
      event: "column_combine_via_plus_modal",
      custom_expressions_used: ["concat"],
      database_id: SAMPLE_DB_ID,
    });
  });

  it("should allow combining columns when aggregating", function () {
    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          limit: 1,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    cy.findByTestId("TableInteractive-root").should("exist");
    combineColumns({
      columns: ["Created At: Hour of day", "Count"],
      newColumn: "Combined Created At: Hour of day, Count",
      example: "2042-01-01 12:34:56.789 123",
      newValue: "0 766",
    });
  });
});

function combineColumns({
  columns,
  example,
  newColumn,
  newValue,
}: {
  columns: string[];
  example: string;
  newColumn: string;
  newValue?: string;
}) {
  const requestAlias = _.uniqueId("dataset");
  cy.intercept("POST", "/api/dataset").as(requestAlias);
  cy.findByLabelText("Add column").click();

  popover().findByText("Combine columns").click();
  for (const column of columns) {
    selectColumn(column);
  }

  if (example) {
    popover().findByTestId("combine-example").should("have.text", example);
  }

  popover().button("Done").click();

  cy.wait(`@${requestAlias}`);

  cy.findAllByRole("columnheader")
    .last()
    .should("have.text", newColumn)
    .should("be.visible");

  if (newValue) {
    cy.findByRole("gridcell", { name: newValue }).should("be.visible");
  }
}

function selectColumn(name: string) {
  popover().findAllByText("Select a column...").first().click();
  popover().last().findByText(name).click();
}
