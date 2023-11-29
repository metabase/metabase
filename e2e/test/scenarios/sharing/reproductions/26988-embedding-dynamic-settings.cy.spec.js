import { restore } from "e2e/support/helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

describe("issue 26988", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should apply embedding settings passed in URL on load", () => {
    cy.createDashboardWithQuestions({
      questions: [
        {
          name: "Q1",
          query: {
            "source-table": ORDERS_ID,
            limit: 3,
          },
        },
      ],
    }).then(({ dashboard }) => {
      cy.request("POST", `/api/dashboard/${dashboard.id}/public_link`).then(
        ({ body: { uuid } }) => {
          cy.signOut();

          cy.visit({
            url: `/public/dashboard/${uuid}`,
            qs: { enableCypressIframe: true },
          });

          // default font
          cy.get("body").should("have.css", "font-family", `Lato, sans-serif`);

          cy.wait(1000);

          cy.visit({
            url: `/public/dashboard/${uuid}`,
            qs: { enableCypressIframe: true, font: "Oswald" },
          });

          cy.get("body").should(
            "have.css",
            "font-family",
            `Oswald, sans-serif`,
          );
        },
      );
    });
  });
});
