import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 36669", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be able to change question data source to raw data after selecting saved question (metabase#36669)", () => {
    const questionDetails = {
      name: "Orders 36669",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    createQuestion(questionDetails).then(() => {
      startNewQuestion();
    });

    entityPickerModal().within(() => {
      cy.findByPlaceholderText("Search this collection or everywhere…").type(
        "Orders 36669",
      );

      cy.findByRole("tabpanel").findByText("Orders 36669").click();
    });

    getNotebookStep("data").findByText("Orders 36669").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();

      cy.log("verify Tables are listed");
      cy.findByRole("tabpanel").should("contain", "Orders");
    });
  });
});
