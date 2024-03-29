import {
  openPublicLinkPopoverFromMenu,
  restore,
  visitQuestion,
} from "e2e/support/helpers";

const question = {
  name: "17019",
  native: {
    query: "select {{foo}}",
    "template-tags": {
      foo: {
        id: "08edf340-3d89-cfb1-b7f0-073b9eca6a32",
        name: "foo",
        "display-name": "Filter",
        type: "text",
      },
    },
  },
  display: "scalar",
};

describe("issue 17019", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(question).then(({ body: { id } }) => {
      // Enable sharing
      cy.request("POST", `/api/card/${id}/public_link`);

      visitQuestion(id);
    });
  });

  it("question filters should work for embedding/public sharing scenario (metabase#17019)", () => {
    openPublicLinkPopoverFromMenu();

    cy.findByTestId("public-link-popover-content")
      .findByTestId("public-link-input")
      .invoke("val")
      .then(publicLink => {
        cy.visit(publicLink);
      });

    cy.findByPlaceholderText("Filter").type("456{enter}");

    // We should see the result as a scalar
    cy.findByTestId("scalar-value").contains("456");
    // But let's also check that the filter widget has that same value still displayed
    cy.findByDisplayValue("456");
  });
});
