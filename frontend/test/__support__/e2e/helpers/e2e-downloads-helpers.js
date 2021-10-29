const xlsx = require("xlsx");

/**
 * Trigger the download of CSV or XLSX files and assert on the results in the related sheet.
 * It applies to both unsaved questions (queries) and the saved ones.
 *
 * @param {Object} params
 * @param {("csv"|"xlsx")} params.fileType
 * @param {number} [params.questionId]
 * @param {function} callback
 */
export function downloadAndAssert({ fileType, questionId } = {}, callback) {
  const downloadClassName = `.Icon-${fileType}`;
  const endpoint = getEndpoint(fileType, questionId);

  /**
   * Please see the official Cypress example for more details:
   * https://github.com/cypress-io/cypress-example-recipes/blob/master/examples/testing-dom__download/cypress/integration/form-submission-spec.js
   */
  cy.url().then(currentPage => {
    cy.intercept("POST", endpoint, req => {
      // We must redirect in order to avoid Cypress being stuck on waiting for the new page to load.
      // But we want to stay on the same page, instead of redirecting to `/` or something else.
      req.redirect(currentPage);
    }).as("fileDownload");
  });

  cy.log(`Downloading ${fileType} file`);

  cy.icon("download").click();
  // Initiate the file download
  cy.get(downloadClassName).click();

  cy.wait("@fileDownload")
    .its("request")
    .then(req => {
      // The payload for the xlsx is in the binary form
      fileType === "xlsx" && Object.assign(req, { encoding: "binary" });

      cy.request(req).then(({ body }) => {
        const { SheetNames, Sheets } = xlsx.read(body, {
          type: "binary",
        });

        const sheetName = SheetNames[0];
        const sheet = Sheets[sheetName];

        callback(sheet);
      });
    });
}

function getEndpoint(fileType, questionId) {
  const questionEndpoint = `/api/card/${questionId}/query/${fileType}`;
  const queryEndpoint = `/api/dataset/${fileType}`;

  return questionId ? questionEndpoint : queryEndpoint;
}
