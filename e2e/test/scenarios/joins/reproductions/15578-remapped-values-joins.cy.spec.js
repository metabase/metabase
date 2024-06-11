import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  entityPickerModal,
  entityPickerModalTab,
  openProductsTable,
  queryBuilderHeader,
  queryBuilderMain,
  restore,
  visualize,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const JOINED_QUESTION_NAME = "15578";

describe("issue 15578", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");

    // Remap display value
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    cy.createQuestion({
      name: JOINED_QUESTION_NAME,
      query: { "source-table": ORDERS_ID },
    });
  });

  it("joining on a question with remapped values should work (metabase#15578)", () => {
    openProductsTable({ mode: "notebook" });

    cy.button("Join data").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText(JOINED_QUESTION_NAME).click();
    });

    visualize();

    queryBuilderHeader()
      .findByTestId("question-table-badges")
      .within(() => {
        cy.findByText("Products").should("be.visible");
        cy.findByText(JOINED_QUESTION_NAME).should("be.visible");
      });

    queryBuilderMain().within(() => {
      cy.findByText("Category").should("be.visible");
      cy.findByText(`${JOINED_QUESTION_NAME} → ID`).should("be.visible");
    });
  });
});
