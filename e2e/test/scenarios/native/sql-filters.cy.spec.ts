const { H } = cy;
import type { NativeQuestionDetails } from "e2e/support/helpers";
import type { CardId } from "metabase-types/api";

const TAG_ID = "49596bcb-62bb-49d6-a92d-bf5dbfddf43b";

describe("scenarios > filters > sql filters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should allow multiple values for a variable in regular, public, and embedded questions", () => {
    const values = ["Gadget", "Widget"];
    const questionDetails: NativeQuestionDetails = {
      name: "SQL",
      native: {
        query: "SELECT * FROM products WHERE category IN ({{tag}})",
        "template-tags": {
          tag: { id: TAG_ID, name: "tag", "display-name": "Tag", type: "text" },
        },
      },
      parameters: [
        {
          id: TAG_ID,
          type: "string/=",
          name: "Tag",
          slug: "tag",
          target: ["variable", ["template-tag", "tag"]],
          isMultiSelect: true,
        },
      ],
      enable_embedding: true,
      embedding_params: { tag: "enabled" },
    };

    cy.log("regular question");
    H.createNativeQuestion(questionDetails, {
      visitQuestion: true,
      wrapId: true,
    });
    setMultipleValues(values);
    cy.findAllByTestId("run-button").first().click();
    cy.wait("@cardQuery");
    assertValuesInTable(values);

    cy.log("public question");
    cy.get<CardId>("@questionId").then((questionId) =>
      H.visitPublicQuestion(questionId),
    );
    setMultipleValues(values);
    assertValuesInTable(values);

    cy.log("embedded question");
    cy.get<CardId>("@questionId").then((questionId) =>
      H.visitEmbeddedPage({
        resource: { question: questionId },
        params: {},
      }),
    );
    setMultipleValues(values);
    assertValuesInTable(values);
  });

  it("should show the filters in a toggleable list on small screens", () => {
    H.createNativeQuestion(
      {
        name: "SQL",
        native: {
          query: "SELECT * FROM products WHERE category = {{category}}",
          "template-tags": {
            category: {
              id: TAG_ID,
              name: "category",
              "display-name": "Category",
              type: "text",
              default: "Gizmo",
            },
          },
        },
      },
      { visitQuestion: true },
    );
    cy.viewport(480, 800);

    filterInput().should("not.be.visible");

    cy.button("1 active filter").click();
    filterInput().should("be.visible").and("have.value", "Gizmo");

    cy.button("Close").click();
    filterInput().should("not.be.visible");
  });

  function filterInput() {
    return H.filterWidget().findByRole("textbox");
  }

  function setMultipleValues(values: string[]) {
    H.filterWidget().click();
    H.popover().within(() => {
      H.multiAutocompleteInput().type(values.join(","));
      cy.button("Add filter").click();
    });
  }

  function assertValuesInTable(values: string[]) {
    H.tableInteractive().within(() => {
      values.forEach((value) => {
        cy.findAllByText(value).should("have.length.gte", 1);
      });
    });
  }
});
