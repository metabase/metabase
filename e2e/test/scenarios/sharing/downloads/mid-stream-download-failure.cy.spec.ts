const { H } = cy;

// Reproduction for the streaming-download corruption bug: when a query fails
// *after* the download stream has started, the server used to append a JSON error
// blob and close the connection cleanly. The client couldn't tell, so it saved a
// corrupt file and reported success. The server now aborts the connection
// mid-stream and the client surfaces a download error instead.
//
// To fail *mid-stream* (not before the response commits) the query has to start
// streaming and then blow up. This native query previews fine — the query builder
// caps results at 2000 rows, below the division-by-zero at row 5000 — but the CSV
// export runs unbounded, streams past the failing row, and aborts.
describe("scenarios > sharing > downloads > mid-stream failure", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("surfaces a download error when a query fails after the stream has started", () => {
    H.createNativeQuestion({
      name: "Fails mid-stream",
      native: {
        query: "SELECT 100 / (x - 5000) AS v FROM SYSTEM_RANGE(1, 10000)",
      },
    }).then(({ body: card }) => {
      cy.intercept("POST", `/api/card/${card.id}/query`).as("preview");
      H.visitQuestion(card.id);
    });

    cy.log("Preview loads because it is capped below the failing row");
    cy.wait("@preview");
    cy.findByLabelText("Download results").should("be.visible").click();

    cy.log("Trigger a full CSV export, which streams past the failing row");
    H.popover().within(() => {
      cy.findByText(".csv").click();
      cy.findByTestId("download-results-button").click();
    });

    cy.log(
      "The aborted stream is surfaced as a download error, not a silent success",
    );
    cy.findByTestId("status-root-container", { timeout: 15000 })
      .should("contain", "Download error")
      .and("not.contain", "Download completed");
  });
});
