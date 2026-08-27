import { parse } from "csv-parse/browser/esm/sync";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > csv downloads", () => {
  beforeEach(() => {
    cy.deleteDownloadsFolder();
    H.prepareSdkIframeEmbedTest({ signOut: true });
  });

  const addGroupBy = (column: string) => {
    cy.findByTestId("step-summarize-0-0")
      .findByTestId("breakout-step")
      .findAllByTestId("notebook-cell-item")
      .should("have.length.at.least", 1)
      .last()
      .click();
    H.popover().within(() => {
      cy.findByText(column).click();
    });
  };

  const addSummarize = (metric: string) => {
    cy.findByText("Pick a function or metric").click();
    H.popover().within(() => {
      cy.findByText(metric).click();
    });
  };

  const setup = () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");

    H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-question",
          attributes: {
            questionId: "new",
            withDownloads: true,
          },
        },
      ],
    });

    // Pick Orders table from the data picker
    H.getSimpleEmbedIframeContent().contains("Pick your starting data");
    H.getSimpleEmbedIframeContent().within(() => {
      H.popover().within(() => {
        cy.findByText("Orders").click();
      });

      addSummarize("Count of rows");
      addGroupBy("Subtotal");
      addGroupBy("Created At");
      cy.button("Visualize").click();
    });

    cy.wait("@dataset");

    // Switch to Pivot Table visualization
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByTestId("chart-type-selector-button").click();

      cy.findByText("Pivot Table").click();
    });

    cy.wait("@pivotDataset");
  };

  it("should download a non-empty pivoted CSV for an ad-hoc pivot table (metabase#70757)", () => {
    setup();

    // Intercept the CSV download request and assert the response is non-empty.
    // Before the fix, pivoted downloads returned blank CSVs because
    // visualization_settings (including pivot_table.column_split) were not passed.
    cy.intercept("POST", "/api/dataset/csv", (req) => {
      req.continue((res) => {
        expect(res.statusCode).to.eq(200);
        expect(res.headers["content-type"]).to.include("text/csv");

        const csvContent = res.body;
        const lines = csvContent.split("\n").filter(Boolean);
        expect(lines.length).to.be.greaterThan(1);

        // this will error out if the CSV is invalid
        parse(csvContent);

        res.send({ statusCode: 200 });
      });
    }).as("csvDownload");

    H.getSimpleEmbedIframeContent().within(() => {
      // Click the download button on the toolbar
      cy.findByLabelText("download icon").should("be.visible").click();

      // Select CSV format
      cy.findByText(".csv").click();

      // Ensure "Keep the data pivoted" is checked
      cy.findByTestId("keep-data-pivoted").then(($checkbox) => {
        if (!$checkbox.prop("checked")) {
          cy.findByTestId("keep-data-pivoted").click();
        }
      });

      // Click the download button
      cy.findByTestId("download-results-button").click();
    });

    cy.wait("@csvDownload");

    cy.verifyDownload("query_result_", { contains: true });
  });
});
