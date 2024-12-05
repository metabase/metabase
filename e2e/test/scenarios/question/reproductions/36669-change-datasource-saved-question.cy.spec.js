import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 36669", () => {
  beforeEach(() => {
    H.restore();
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

    H.createQuestion(questionDetails).then(() => {
      H.startNewQuestion();
    });

    H.entityPickerModal().within(() => {
      cy.findByPlaceholderText("Search this collection or everywhere…").type(
        "Orders 36669",
      );

      cy.findByRole("tabpanel").findByText("Orders 36669").click();
    });

    H.getNotebookStep("data").findByText("Orders 36669").click();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();

      cy.log("verify Tables are listed");
      cy.findByRole("tabpanel").should("contain", "Orders");
    });
  });
});
