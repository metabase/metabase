// Imported from drillthroughs.e2e.spec.js
import {
  restore,
  signInAsAdmin,
  signInAsNormalUser,
} from "__support__/cypress";

const dash_name = "Drill Test Dashboard";

describe("scenarios > visualizations > drillthroughs > dash_drill", () => {
  before(() => {
    restore();
    signInAsAdmin();

    // // Make 3rd question a bar visualization
    // cy.visit("/question/2");
    // cy.findByText("Visualization").click();
    // cy.findByText("Choose a visualization");
    // cy.get(".Icon-bar").click();
    // cy.findByText("Save");
    // cy.findAllByText("Save")
    //     .last()
    //     .click();

    // // Add 3rd question to a new dashboard
    // cy.request("POST", "/api/dashboard", {
    //     name: dash_name,
    //     parameters: [],
    // })
    // cy.request("POST", "/api/dashboard/2/cards", {
    //     id: 2,
    //     cardId: 3,
    //     parameter_mappings: [],
    // })

    // // Expand view of card
    // cy.visit("/dashboard/2");
    // cy.get(".Icon-pencil").click()
    // cy.get(".DashCard")
    //     .trigger("mousedown", "bottomRight")
    //     .trigger("mousemove", { clientX: 500, clientY: 350 })
    //     .trigger("mouseup");
    // cy.findByText("Save").click();;
    // cy.findByText("Save").should("not.exist");

    // Make second question scalar
    cy.visit("/question/1");
    cy.findByText("Visualization").click();
    cy.get(".Icon-number").click();
    cy.findByText("Save").click();
    cy.findAllByText("Save").last().click();
    cy.findAllByText("Save").should("not.exist");

    // Add it to a new dashboard
    cy.request("POST", "/api/dashboard", {
      name: dash_name,
      parameters: [],
    });
    cy.request("POST", "/api/dashboard/2/cards", {
      id: 2,
      cardId: 2,
      parameter_mappings: [],
    });
  });
  beforeEach(signInAsNormalUser);

  describe("title click action", () => {
    describe("from a scalar card title", () => {
      it("results in a correct url", () => {
        cy.visit("/dashboard/2");
        cy.findByText(dash_name);
        cy.findByText("Orders, Count").click();
        cy.url().should("include", "/question/2");
        // cy.findByText("Orders, Count, Grouped by Created At (year)").click();
        // cy.findByText(dash_name).should("not.exist");
        // cy.url().should("eq", "/question/3");
      });
      it("shows the name lineage correctly", () => {
        // *** What is name lineage?
      });
      it("results in correct query result", () => {});
    });

    // *** maybe put this in a different file?
    describe("from a dashcard multiscalar legend", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });
  });

  describe("drill-through action from dashboard", () => {
    describe("from a scalar card value", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });

    describe("from a scalar with active filter applied", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });

    // *** Not sure what this one is either
    describe("from a aggregation multiscalar legend", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });
  });
});
