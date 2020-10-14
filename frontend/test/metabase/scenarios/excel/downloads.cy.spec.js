import { restore, signInAsAdmin, openOrdersTable } from "__support__/cypress";

const path = require("path");

describe("file download", () => {
  // metabase/downloads
  const downloadsFolder = "./downloads";

  before(restore);
  beforeEach(() => {
    signInAsAdmin();
    cy.task("clearDownloads");

    // The next command allow downloads in Electron, Chrome, and Edge
    // without any users popups or file save dialogs.
    if (Cypress.browser.name !== "firefox") {
      // since this call returns a promise, must tell Cypress to wait
      // for it to be resolved
      cy.wrap(
        Cypress.automation("remote:debugger:protocol", {
          command: "Page.setDownloadBehavior",
          params: { behavior: "allow", downloadPath: downloadsFolder },
        }),
        { log: false },
      );
    }
  });

  it("downloads Excel file", () => {
    // let's download a binary file

    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("Orders, Count").click();
    cy.contains("18,760");
    cy.get(".Icon-download").click();
    cy.get(".Icon-xlsx").click();
    // The test doesn't go past this point - it hangs on "form submit" and times out after 1 minute
    // with the message: "Your page did not fire its 'load' event within '60000ms'".

    cy.log("**confirm downloaded file**");

    // NOTE: We need to figure out a way to read the file name, because it is auto-generated:
    // query_result_YYYYY_MM_DD+TIMESTAMP

    cy.log("**Test will break at this point - the file doesn't exist YET**");
    const downloadedFilename = path.join(
      downloadsFolder,
      "FIGURE_THIS_OUT.xlsx",
    );

    // ensure the file has been saved before trying to parse it
    cy.readFile(downloadedFilename, "binary", { timeout: 15000 }).should(
      buffer => {
        // by having length assertion we ensure the file has text
        // since we don't know when the browser finishes writing it to disk

        // Tip: use expect() form to avoid dumping binary contents
        // of the buffer into the Command Log
        expect(buffer.length).to.be.gt(100);
      },
    );

    cy.log("**the file exists**");

    // the first utility library we use to parse Excel files
    // only works in Node, thus we can read and parse
    // the downloaded file using cy.task
    cy.task("readExcelFile", downloadedFilename);
    // returns an array of lines read from Excel file

    // NOTE: This is copied just as an example from Cypress repo
    //       We obviously need to make our own assertions here once we figure the previous steps out.

    // .should("have.length", 4)
    // .then(list => {
    //   expect(list[0], "header line").to.deep.equal([
    //     "First name",
    //     "Last name",
    //     "Occupation",
    //     "Age",
    //     "City",
    //     "State",
    //   ]);

    //   expect(list[1], "first person").to.deep.equal([
    //     "Joe",
    //     "Smith",
    //     "student",
    //     20,
    //     "Boston",
    //     "MA",
    //   ]);
    // });
  });
});
