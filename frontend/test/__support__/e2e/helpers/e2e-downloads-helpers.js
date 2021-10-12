const targetFolder = "cypress/downloads/";
const xlsxFileLocation = targetFolder + "temp.xlsx";

const targetXML = targetFolder + "xl/worksheets/sheet1.xml";

export function analyzeRawXML(binaryPayload, callback) {
  emptyFolder(targetFolder);

  createXLSXFile(xlsxFileLocation, binaryPayload);

  cy.task("unzip", {
    source: xlsxFileLocation,
    target: targetFolder,
  }).then(() => {
    /**
     * `cy.readFile` feeds the contents of the file in the form of the string back to Cypress.
     * That's not super useful to us because we can assert only that some string exist or that it doesn't.
     * We also want to be able to check the exact row, column, cell, etc.
     * By parsing the string into an XML document, we can use DOM selectors to isolate the exact piece of the document that we need.
     */
    cy.readFile(targetXML).then(contents => {
      if (window.DOMParser) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(contents, "text/xml");

        callback(xmlDoc);
      }
    });
  });
}

function emptyFolder(folder) {
  cy.exec(`rm -rf ${folder}`);
}

function createXLSXFile(location, payload) {
  cy.writeFile(location, payload, {
    encoding: "binary",
  });
}
