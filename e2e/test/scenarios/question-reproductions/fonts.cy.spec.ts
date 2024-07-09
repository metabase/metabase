import { openOrdersTable, restore } from "e2e/support/helpers";

describe("fonts", () => {
  beforeEach(() => {
    restore();
    cy.intercept("/app/fonts/Lato/lato-v16-latin-regular.woff2").as(
      "font-regular",
    );
    cy.intercept("/app/fonts/Lato/lato-v16-latin-700.woff2").as("font-bold");
    cy.signInAsAdmin();
  });

  it("works", () => {
    openOrdersTable({ mode: "notebook" });

    cy.wait(1000);

    // cy.get("@font-regular.all").should("have.length", 1);
    // cy.get("@font-regular").should(({ response }) => {
    //   expect(response).to.include({ statusCode: 200 });
    // });

    // cy.get("@font-bold.all").should("have.length", 1);
    // cy.get("@font-bold").should(({ response }) => {
    //   expect(response).to.include({ statusCode: 200 });
    // });

    // cy.document()
    // .then(document => document.fonts.ready)
    // .then(fonts => {
    //   cy.wrap(fonts).invoke("check", "16px Lato").should("be.true");
    // });

    cy.get("head").then(([$head]) => {
      const index = $head.innerHTML.indexOf(
        "app/fonts/Lato/lato-v16-latin-regular.woff2",
      );
      expect(index).to.be.greaterThan(0);
    });
  });
});
