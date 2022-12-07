import {
  restore,
  popover,
  filterWidget,
  editDashboard,
  saveDashboard,
  visitDashboard,
  setFilter,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > nested questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("dashboard filters should work on nested question (metabase#12614, metabase#13186, metabase#18113)", () => {
    const filter = {
      name: "Text Filter",
      slug: "text",
      id: "27454068",
      type: "string/=",
      sectionId: "string",
    };

    cy.createNativeQuestion({
      name: "18113 Source",
      native: {
        query: "select * from products limit 5",
      },
      display: "table",
    }).then(({ body: { id: Q1_ID } }) => {
      const nestedQuestion = {
        name: "18113 Nested",
        query: {
          "source-table": `card__${Q1_ID}`,
        },
      };

      const dashboardDetails = {
        name: "Nested Filters",
        parameters: [filter],
      };

      cy.createQuestionAndDashboard({
        questionDetails: nestedQuestion,
        dashboardDetails,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });
    });

    editDashboard();
    cy.findByText(filter.name).find(".Icon-gear").click();
    cy.findByText("Select…").click();

    // This part reproduces metabase#13186
    cy.log("Reported failing in v0.36.4 (`Category` is missing)");
    popover().within(() => {
      cy.findByText(/Ean/i);
      cy.findByText(/Title/i);
      cy.findByText(/Vendor/i);
      cy.findByText(/Category/i).click();
    });

    saveDashboard();

    // Add multiple values (metabase#18113)
    filterWidget().click();
    cy.findByPlaceholderText("Enter some text").type(
      "Gizmo{enter}Gadget{enter}",
    );
    cy.button("Add filter").click();
    cy.wait("@dashcardQuery2");

    cy.findByText("2 selections");
    cy.get("tbody > tr").should("have.length", 2);

    cy.findByText("Doohickey").should("not.exist");

    cy.reload();
    cy.wait("@dashcardQuery2");

    cy.location("search").should("eq", "?text=Gizmo&text=Gadget");
    cy.findByText("2 selections");

    editDashboard();
    cy.findByText(filter.name).find(".Icon-gear").click();
    cy.findByText("Column to filter on")
      .parent()
      .contains(/Category/i)
      .click();

    // This part reproduces metabase#12614
    popover().within(() => {
      cy.findByText(/Ean/i);
      cy.findByText(/Title/i);
      cy.findByText(/Vendor/i);
      cy.findByText(/Category/i).click();
    });
  });

  it("should be possible to use ID filter on a nested question (metabase#17212)", () => {
    const baseQuestion = {
      query: { "source-table": PRODUCTS_ID },
    };

    cy.createQuestion(baseQuestion).then(({ body: { id: baseQuestionId } }) => {
      const questionDetails = {
        query: { "source-table": `card__${baseQuestionId}` },
      };

      cy.createQuestionAndDashboard({ questionDetails }).then(
        ({ body: { dashboard_id } }) => {
          visitDashboard(dashboard_id);
        },
      );
    });

    editDashboard();

    setFilter("ID");

    cy.findByText("No valid fields").should("not.exist");

    cy.findByText("Select…").click();
    popover().contains("ID").click();
  });
});
