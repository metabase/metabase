const xlsx = require("xlsx");

/**
 * Trigger the download of CSV or XLSX files and assert on the results in the related sheet.
 * It applies to both unsaved questions (queries) and the saved ones.
 *
 * @param {Object} params
 * @param {("csv"|"xlsx")} params.fileType - file type we're downloading
 * @param {number} [params.questionId] - needed only for saved questions
 * @param {boolean} [params.raw] - tell SheetJs not to parse values
 * @param {boolean} [params.logResults] - preview the results in the console log
 * @param {function} callback
 */
export function downloadAndAssert(
  { fileType, questionId, raw, logResults, publicUid } = {},
  callback,
) {
  const downloadClassName = `.Icon-${fileType}`;
  const endpoint = getEndpoint(fileType, questionId, publicUid);
  const isPublicDownload = !!publicUid;
  const method = isPublicDownload ? "GET" : "POST";

  /**
   * Please see the official Cypress example for more details:
   * https://github.com/cypress-io/cypress-example-recipes/blob/master/examples/testing-dom__download/cypress/integration/form-submission-spec.js
   */

  cy.intercept(method, endpoint, req => {
    /**
     * We must redirect in order to avoid Cypress being stuck on waiting for the new page to load.
     * Intetionally redirecting to a non-existing page.
     *
     * Explanation:
     * If we redirect to ANY of the existing pages, there's a lot of requests that need to complete for that page.
     *  - This helper function is usually the last piece of code to execute in any given test.
     *  - As soon as the assertions are complete, the new test starts
     *  - Assertions are usually faster than all of the previously mentioned requests from the redirect
     *  - This results in the next test being poluted with the requests that didn't finish from the last one.
     *  - Those "spill-over" requests end up in the beforeEach hook of the next test and can have unexpected results.
     */

    req.redirect("/foo");
  }).as("fileDownload");

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
          // See the full list of Parsing options: https://github.com/SheetJS/sheetjs#parsing-options
          type: "binary",
          raw,
        });

        const sheetName = SheetNames[0];
        const sheet = Sheets[sheetName];

        logResults && console.log(sheet);

        callback(sheet);
      });
    });
}

export function assertSheetRowsCount(expectedCount) {
  return sheet => {
    const range = xlsx.utils.decode_range(sheet["!ref"]);
    expect(range.e.r).to.eq(expectedCount);
  };
}

function getEndpoint(fileType, questionId, publicUid) {
  if (publicUid) {
    return `/public/question/${publicUid}.${fileType}**`;
  }

  const questionEndpoint = `/api/card/${questionId}/query/${fileType}`;
  const queryEndpoint = `/api/dataset/${fileType}`;

  return questionId ? questionEndpoint : queryEndpoint;
}
