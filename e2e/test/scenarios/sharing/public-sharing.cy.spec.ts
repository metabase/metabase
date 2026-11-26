const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const QUESTION_NAME = "Public question";

describe("scenarios > admin > settings > public sharing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/card/public").as("getPublicQuestions");
    cy.intercept("DELETE", "/api/card/*/public_link").as("revokePublicLink");
    cy.intercept("GET", "/api/public/card/*").as("getPublicCard");
  });

  it("should open a public question link from the admin settings, revoke it, and stop serving it", () => {
    H.createQuestion({
      name: QUESTION_NAME,
      query: { "source-table": ORDERS_ID },
    }).then(({ body: { id } }) => {
      cy.request<{ uuid: string }>("POST", `/api/card/${id}/public_link`).then(
        ({ body: { uuid } }) => {
          cy.wrap(`/public/question/${uuid}`).as("publicPath");
        },
      );
    });

    cy.visit("/admin/settings/public-sharing");
    cy.wait("@getPublicQuestions");
    cy.findByTestId("admin-layout-content")
      .findByText("Shared questions")
      .should("be.visible");

    cy.get<string>("@publicPath").then((publicPath) => {
      cy.findByTestId("admin-layout-content")
        .findByText(`${location.origin}${publicPath}`)
        .click();
      cy.url().should("eq", `${location.origin}${publicPath}`);
      cy.wait("@getPublicCard").its("response.statusCode").should("eq", 200);
      cy.findByRole("heading", { name: QUESTION_NAME }).should("be.visible");
    });

    cy.visit("/admin/settings/public-sharing");
    cy.wait("@getPublicQuestions");
    cy.findByTestId("admin-layout-content")
      .findByText(QUESTION_NAME)
      .closest("tr")
      .findByRole("button", { name: "Revoke link" })
      .click();
    H.modal().within(() => {
      cy.findByText("Disable this link?").should("be.visible");
      cy.button("Yes").click();
    });
    cy.wait("@revokePublicLink").its("response.statusCode").should("eq", 204);
    cy.findByTestId("admin-layout-content")
      .findByText("No questions have been publicly shared yet.")
      .should("be.visible");

    cy.log("the revoked link stays gone after a reload");
    cy.reload();
    cy.wait("@getPublicQuestions");
    cy.findByTestId("admin-layout-content")
      .findByText("No questions have been publicly shared yet.")
      .should("be.visible");
    cy.findByTestId("admin-layout-content")
      .findByText(QUESTION_NAME)
      .should("not.exist");

    cy.log("the public URL stops working");
    // A fresh alias, so the wait cannot pick up a request from the first visit
    cy.intercept("GET", "/api/public/card/*").as("getRevokedPublicCard");
    cy.get<string>("@publicPath").then((publicPath) => {
      cy.visit(publicPath);
    });
    cy.wait("@getRevokedPublicCard")
      .its("response.statusCode")
      .should("eq", 404);
    cy.findByTestId("embed-frame").findByText("Not found").should("be.visible");
    cy.findByRole("heading", { name: QUESTION_NAME }).should("not.exist");
  });
});
