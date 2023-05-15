import { restore, visitQuestion, describeEE } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "3035",
  query: {
    "source-table": PRODUCTS_ID,
    limit: 10,
  },
};

describeEE("issue 30535", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    });

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });
  });

  it("user session should not apply sandboxing to a signed embedded question (metabase#30535)", () => {
    cy.icon("share").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Embed in your application").click();

    cy.document().then(doc => {
      const iframe = doc.querySelector("iframe");

      cy.signOut();
      cy.signInAsSandboxedUser();

      cy.visit(iframe.src);
    });

    cy.findByRole("table").within(() => {
      // The sandboxed user has an attribute cat="Widget"
      cy.findAllByText("Widget");
      // Sandboxing shouldn't affect results so we should see other product categories as well
      cy.findAllByText("Gizmo");
    });
  });
});
