import { restore, visitDashboard, popover } from "__support__/e2e/helpers";

const nativeQuestionDetails = {
  name: "13816_Q1",
  native: {
    query: "SELECT * FROM PRODUCTS",
  },
};

describe("issue 13186", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuestionDetails).then(
      ({ body: { id: Q1_ID } }) => {
        cy.log("Convert Q1 to `query` and save as Q2");
        cy.createQuestion({
          name: "13816_Q2",
          query: {
            "source-table": `card__${Q1_ID}`,
          },
        });
      },
    );

    cy.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      visitDashboard(DASHBOARD_ID);
    });
  });

  it("should show all filter options for a nested question (metabase#13186)", () => {
    // Add Q2 to that dashboard
    cy.icon("pencil").click();
    cy.icon("add")
      .last()
      .click();
    cy.findByText("13816_Q2").click();

    // Add filter to the dashboard...
    cy.icon("filter").click();
    cy.findByText("Text or Category").click();
    cy.findByText("Dropdown").click();
    // ...and try to connect it to the question
    cy.findByText("Select…").click();

    cy.log("Reported failing in v0.36.4 (`Category` is missing)");
    popover().within(() => {
      cy.findByText(/Category/i);
      cy.findByText(/Title/i);
      cy.findByText(/Vendor/i);
    });
  });
});
