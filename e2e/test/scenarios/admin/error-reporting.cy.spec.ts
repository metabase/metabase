const { H } = cy;

const downloadsFolder = Cypress.config("downloadsFolder");

describe("error reporting modal", () => {
  beforeEach(() => {
    cy.deleteDownloadsFolder();
    H.restore();
  });

  it("should download a diagnostic report with the question and its query results", () => {
    cy.signInAsAdmin();
    H.createQuestion(
      {
        name: "Diagnostic Question 1",
        query: { "source-table": 1, limit: 10 },
      },
      { visitQuestion: true, wrapId: true },
    );

    H.tableInteractive().realClick();
    cy.realPress(["Control", "F1"]);

    H.modal().within(() => {
      cy.findByText("Gather diagnostic information").should("be.visible");
      cy.findByLabelText("Query results").click();
      cy.findByLabelText("Query results").should("be.checked");
      cy.button(/Download/i).click();
    });

    cy.get<number>("@questionId").then((questionId) => {
      getDiagnosticInfoFile().then((fileContent) => {
        expect(fileContent.entityName).to.equal("question");
        expect(fileContent.entityInfo?.id).to.equal(questionId);
        expect(fileContent).to.have.property("frontendErrors");
        expect(fileContent).to.have.property("backendErrors");
        expect(fileContent).to.have.property("userLogs");
        expect(fileContent.logs).to.be.an("array");
        expect(fileContent.bugReportDetails).to.be.an("object");
        expect(fileContent.queryResults?.data.rows).to.have.length(10);
      });
    });
  });
});

type DiagnosticInfoFile = {
  entityName?: string;
  entityInfo?: { id: number };
  logs?: unknown[];
  bugReportDetails?: unknown;
  queryResults?: { data: { rows: unknown[][] } };
};

function getDiagnosticInfoFile(): Cypress.Chainable<DiagnosticInfoFile> {
  cy.findByLabelText("Gather diagnostic information").should("not.exist");
  return cy
    .verifyDownload("metabase-diagnostic-info-", {
      contains: true,
      timeout: 20 * 1000,
      interval: 1000,
    })
    .then(() => {
      return cy
        .task<string[]>("findFiles", {
          path: downloadsFolder,
          fileName: "metabase-diagnostic-info-",
        })
        .then(([fileName]) => {
          return cy.readFile<DiagnosticInfoFile>(
            `${downloadsFolder}/${fileName}`,
          );
        });
    });
}
