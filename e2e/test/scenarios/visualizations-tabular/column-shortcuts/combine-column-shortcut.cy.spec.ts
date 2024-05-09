import _ from "underscore";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, popover, createQuestion } from "e2e/support/helpers";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > combine shortcut", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
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

  cy.findByRole("columnheader", { name: newColumn }).should("be.visible");

  if (newValue) {
    cy.findByRole("gridcell", { name: newValue }).should("be.visible");
  }
}

function selectColumn(name: string) {
  popover().findAllByText("Select a column...").first().click();
  popover()
    .last()
    .within(() => {
      if (name) {
        cy.findByText(name).click();
      }
    });
}
