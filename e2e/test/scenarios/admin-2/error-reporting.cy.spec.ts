import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  modal,
  restore,
  visitDashboard,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";

const downloadsFolder = Cypress.config("downloadsFolder");

describe("error reporting modal", () => {
  beforeEach(() => {
    cy.deleteDownloadsFolder();
    restore();
  });

  it('should show an error reporting modal when pressing "Ctrl + F1" on the home page', () => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/");

    cy.findByTestId("home-page")
      .findByText(/see what metabase can do/i)
      .realClick();
    cy.wait(500);

    cy.realPress(["Control", "F1"]);

    modal().within(() => {
      cy.findByText("Download diagnostic information").should("be.visible");
      cy.button(/Download/i).click();
    });

    getDiagnosticInfoFile().then(fileContent => {
      expect(fileContent.entityName).to.equal(undefined);
      expect(fileContent).to.have.property("frontendErrors");
      expect(fileContent).to.have.property("backendErrors");
      expect(fileContent).to.have.property("userLogs");
      expect(fileContent).to.have.property("logs");
      expect(fileContent).to.have.property("bugReportDetails");
    });
  });

  it("should not show error reporting modal in embedding", () => {
    restore();
    cy.signInAsAdmin();
    visitFullAppEmbeddingUrl({
      url: "/",
      qs: {
        top_nav: true,
      },
      onBeforeLoad: undefined,
    });

    cy.findByTestId("home-page")
      .findByText(/see what metabase can do/i)
      .realClick();

    cy.realPress(["Control", "F1"]);

    modal().should("not.exist");
  });

  it("should include question-specific data when triggered on the question page", () => {
    cy.signInAsAdmin();
    createQuestion(
      {
        name: "Diagnostic Question 1",
        query: { "source-table": 1, limit: 10 },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("TableInteractive-root").realClick();
    cy.realPress(["Control", "F1"]);

    modal().within(() => {
      cy.findByText("Download diagnostic information").should("be.visible");
      cy.findByLabelText("Query results").should("not.be.checked");
      cy.button(/Download/i).click();
    });

    getDiagnosticInfoFile().then(fileContent => {
      expect(fileContent.entityName).to.equal("question");
      expect(fileContent).to.have.property("frontendErrors");
      expect(fileContent).to.have.property("backendErrors");
      expect(fileContent).to.have.property("userLogs");
      expect(fileContent).to.have.property("logs");
      expect(fileContent).to.have.property("bugReportDetails");
      expect(fileContent).to.have.property("entityInfo");
      expect(fileContent).not.to.have.property("queryResults");
    });

    cy.deleteDownloadsFolder();

    cy.realPress(["Control", "F1"]);

    modal().within(() => {
      cy.findByText("Download diagnostic information").should("be.visible");
      cy.findByLabelText("Query results").should("not.be.checked");
      cy.findByLabelText("Query results").click(); // off by default
      cy.findByLabelText("Query results").should("be.checked");
      cy.button(/Download/i).click();
    });

    getDiagnosticInfoFile().then(fileContent => {
      expect(fileContent.entityName).to.equal("question");
      expect(fileContent).to.have.property("frontendErrors");
      expect(fileContent).to.have.property("backendErrors");
      expect(fileContent).to.have.property("userLogs");
      expect(fileContent).to.have.property("logs");
      expect(fileContent).to.have.property("bugReportDetails");
      expect(fileContent).to.have.property("entityInfo");
      expect(fileContent).to.have.property("queryResults");
    });
  });

  it("can include query data on question pages", () => {
    cy.signInAsAdmin();
    createQuestion(
      {
        name: "Diagnostic Question 1",
        query: { "source-table": 1, limit: 10 },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("TableInteractive-root").realClick();
    cy.realPress(["Control", "F1"]);

    modal().within(() => {
      cy.findByText("Download diagnostic information").should("be.visible");
      cy.findByLabelText("Query results").should("not.be.checked");
      cy.findByLabelText("Query results").click(); // off by default
      cy.findByLabelText("Query results").should("be.checked");
      cy.button(/Download/i).click();
    });

    getDiagnosticInfoFile().then(fileContent => {
      expect(fileContent.entityName).to.equal("question");
      expect(fileContent).to.have.property("frontendErrors");
      expect(fileContent).to.have.property("backendErrors");
      expect(fileContent).to.have.property("userLogs");
      expect(fileContent).to.have.property("logs");
      expect(fileContent).to.have.property("bugReportDetails");
      expect(fileContent).to.have.property("entityInfo");
      expect(fileContent).to.have.property("queryResults");
    });
  });

  it("should not include backend logs for non-admin users", () => {
    cy.signInAsNormalUser();
    visitDashboard(ORDERS_DASHBOARD_ID);

    cy.findByTestId("dashboard-grid").realClick();

    cy.realPress(["Control", "F1"]);
    modal().within(() => {
      cy.findByText("Download diagnostic information").should("be.visible");
      cy.findByLabelText("Dashboard definition").should("be.visible");
      cy.findByLabelText("Query results").should("not.exist");
      cy.findByLabelText(/server logs/i).should("not.exist");

      cy.button(/Download/i).click();
    });

    getDiagnosticInfoFile().then(fileContent => {
      expect(fileContent.entityName).to.equal("dashboard");
      expect(fileContent.url).to.include("/dashboard/");

      expect(fileContent).to.have.property("frontendErrors");
      expect(fileContent).to.have.property("bugReportDetails");
      expect(fileContent).to.have.property("entityInfo");
      expect(fileContent).not.to.have.property("logs");
      expect(fileContent).not.to.have.property("userLogs");
      expect(fileContent).not.to.have.property("backendErrors");
    });
  });
});

function getDiagnosticInfoFile() {
  cy.findByLabelText("Download diagnostic information").should("not.exist");
  return cy
    .verifyDownload("metabase-diagnostic-info-", {
      contains: true,
      timeout: 20 * 1000,
      interval: 1000,
    })
    .then(() => {
      return cy
        .task("findFiles", {
          path: downloadsFolder,
          fileName: "metabase-diagnostic-info-",
        })
        .then(([fileName]) => {
          return cy.readFile(`${downloadsFolder}/${fileName}`);
        });
    });
}
