import { restore, visitQuestion } from "__support__/e2e/cypress";

import { onlyOn } from "@cypress/skip-test";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

describe("managing question from the question's details sidebar", () => {
  beforeEach(() => {
    restore();
  });

  Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
    context(`${permission} access`, () => {
      userGroup.forEach(user => {
        onlyOn(permission === "curate", () => {
          describe(`${user} user`, () => {
            beforeEach(() => {
              cy.intercept("PUT", "/api/card/1").as("updateQuestion");

              cy.signIn(user);
              visitQuestion(1);
              cy.findByTestId("saved-question-header-button").click();
            });

            it("should be able to edit question details (metabase#11719-1)", () => {
              // cy.skipOn(user === "nodata");
              cy.findByTestId("edit-details-button").click();
              cy.findByLabelText("Name")
                .click()
                .type("1");
              clickButton("Save");
              assertOnRequest("updateQuestion");
              cy.findByText("Orders1");
            });

            it("should be able to edit a question's description", () => {
              // cy.skipOn(user === "nodata");

              cy.findByRole("button", {
                name: "Add a description",
              }).click();

              cy.findByLabelText("Description")
                .click()
                .type("foo", { delay: 0 });

              clickButton("Save");
              assertOnRequest("updateQuestion");

              cy.findByText("foo");
              cy.findByRole("button", { name: "Add a description" }).should(
                "not.exist",
              );
            });

            it("should be able to move the question (metabase#11719-2)", () => {
              // cy.skipOn(user === "nodata");
              cy.findByTestId("move-button").click();
              cy.findByText("My personal collection").click();
              clickButton("Move");
              assertOnRequest("updateQuestion");
              cy.contains("37.65");
            });

            it("should be able to archive the question (metabase#11719-3, metabase#16512)", () => {
              cy.intercept("GET", "/api/collection/root/items**").as(
                "getItems",
              );
              cy.findByTestId("archive-button").click();
              clickButton("Archive");
              assertOnRequest("updateQuestion");
              cy.wait("@getItems"); // pinned items
              cy.wait("@getItems"); // unpinned items
              cy.location("pathname").should("eq", "/collection/root");
              cy.findByText("Orders").should("not.exist");
            });

            it("should be able to add question to dashboard", () => {
              cy.findByTestId("add-to-dashboard-button").click();

              cy.get(".Modal")
                .as("modal")
                .findByText("Orders in a dashboard")
                .click();

              cy.get("@modal").should("not.exist");
              // By default, the dashboard contains one question
              // After we add a new one, we check there are two questions now
              cy.get(".DashCard").should("have.length", 2);
            });
          });
        });
      });
    });
  });
});

function clickButton(name) {
  cy.button(name)
    .should("not.be.disabled")
    .click();
}

function assertOnRequest(xhr_alias) {
  cy.wait("@" + xhr_alias).then(xhr => {
    expect(xhr.status).not.to.eq(403);
  });

  cy.findByText("Sorry, you don’t have permission to see that.").should(
    "not.exist",
  );
  cy.get(".Modal").should("not.exist");
}
