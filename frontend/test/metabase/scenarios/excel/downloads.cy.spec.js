import { restore, signInAsAdmin, openOrdersTable } from "__support__/cypress";

const path = require("path");
const xlsx = require("xlsx");

describe("file download", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
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
    cy.get(".Icon-xlsx")
      .parent()
      .parent()
      .get('input[name="query"]')
      .invoke("val")
      .then(xlsx_query_params => {
        cy.request({
          url: "/api/dataset/xlsx",
          method: "POST",
          form: true,
          body: { query: xlsx_query_params },
          encoding: "binary",
        }).then(resp => {
          var workbook = xlsx.read(resp.body, { type: "binary" });

          expect(workbook.SheetNames[0]).to.eq("Query result");
          expect(workbook.Sheets["Query result"]["A1"].v).to.eq("Count");
          expect(workbook.Sheets["Query result"]["A2"].v).to.eq(18760);
        });
      });

    cy.get(".Icon-csv")
      .parent()
      .parent()
      .get('input[name="query"]')
      .invoke("val")
      .then(csv_query_params => {
        cy.request({
          url: "/api/dataset/csv",
          method: "POST",
          form: true,
          body: { query: csv_query_params },
          encoding: "binary",
        }).then(resp => {
          var workbook = xlsx.read(resp.body, { type: "binary" });
          expect(workbook.SheetNames[0]).to.eq("Sheet1");
          expect(workbook.Sheets["Sheet1"]["A1"].v).to.eq("Count");
          expect(workbook.Sheets["Sheet1"]["A2"].v).to.eq(18760);
        });
      });
  });
});
