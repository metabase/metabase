import {
  restore,
  popover,
  visualize,
  filter,
  openNotebook,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;
const CC_NAME = "City Length";

const questionDetails = {
  name: "14843",
  query: {
    "source-table": PEOPLE_ID,
    expressions: { [CC_NAME]: ["length", ["field", PEOPLE.CITY, null]] },
  },
};

describe("issue 14843", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
      "schema",
    );

    restore();
    cy.signInAsAdmin();
  });

  it("should correctly filter custom column by 'Not equal to' (metabase#14843)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();

    cy.wait("@schema");

    filter({ mode: "notebook" });
    popover().findByText(CC_NAME).click();
    popover().findByDisplayValue("Equal to").click();
    cy.findByRole("listbox").findByText("Not equal to").click();
    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("3");
      cy.button("Add filter").click();
    });

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`${CC_NAME} is not equal to 3`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rye").should("not.exist");
  });
});
