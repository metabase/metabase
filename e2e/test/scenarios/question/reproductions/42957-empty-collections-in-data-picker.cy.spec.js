import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 42957", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("does not show collections that contain models from different tabs (metabase#42957)", () => {
    createQuestion({
      name: "Model",
      type: "model",
      query: {
        "source-table": ORDERS_ID,
      },
    });

    cy.createCollection({ name: "Collection without models" }).then(
      ({ body: collection }) => {
        cy.wrap(collection.id).as("collectionId");
      },
    );

    cy.get("@collectionId").then(collectionId => {
      createQuestion({
        name: "Question",
        type: "question",
        query: {
          "source-table": ORDERS_ID,
        },
        collection_id: collectionId,
      });
    });

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Models").should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.findByText("Collection without models").should("not.exist");
    });
  });
});
