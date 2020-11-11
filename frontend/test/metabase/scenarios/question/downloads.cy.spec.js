import { restore, signInAsAdmin } from "__support__/cypress";

const xlsx = require("xlsx");

// csv and Excel files have different sheet names, so define them here and we'll reuse it throughout
const testCases = [
  { type: "csv", firstSheetName: "Sheet1" },
  { type: "xlsx", firstSheetName: "Query result" },
];

function testWorkbookDatetimes(workbook, download_type, sheetName) {
  expect(workbook.SheetNames[0]).to.eq(sheetName);
  expect(workbook.Sheets[sheetName]["A1"].v).to.eq("birth_date");
  expect(workbook.Sheets[sheetName]["B1"].v).to.eq("created_at");

  // Excel and CSV will have different formats
  if (download_type === "csv") {
    expect(workbook.Sheets[sheetName]["A2"].v).to.eq("2020-06-03");
    expect(workbook.Sheets[sheetName]["B2"].v).to.eq("2020-06-03T23:41:23");
  } else if (download_type === "xlsx") {
    // We tell the xlsx library to read raw and not parse dates
    // So for the _date_ format we expect an integer
    // And for timestamp, we expect a float
    expect(workbook.Sheets[sheetName]["A2"].v).to.eq(43985);
    expect(workbook.Sheets[sheetName]["B2"].v).to.eq(43985.98707175926);
  }
}

describe("scenarios > question > download", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
  });

  it("downloads Excel and CSV files", () => {
    // let's download a binary file

    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Simple question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("Orders, Count").click();
    cy.contains("18,760");
    cy.get(".Icon-download").click();

    // Programatically issue download requests for this query for both CSV and Excel

    cy.wrap(testCases).each(testCase => {
      const downloadClassName = `.Icon-${testCase.type}`;
      const endpoint = `/api/dataset/${testCase.type}`;
      const sheetName = testCase.firstSheetName;

      cy.log(`downloading a ${testCase.type} file`);

      cy.get(downloadClassName)
        .parent()
        .parent()
        .get('input[name="query"]')
        .invoke("val")
        .then(download_query_params => {
          cy.request({
            url: endpoint,
            method: "POST",
            form: true,
            body: { query: download_query_params },
            encoding: "binary",
          }).then(resp => {
            const workbook = xlsx.read(resp.body, { type: "binary" });

            expect(workbook.SheetNames[0]).to.eq(sheetName);
            expect(workbook.Sheets[sheetName]["A1"].v).to.eq("Count");
            expect(workbook.Sheets[sheetName]["A2"].v).to.eq(18760);
          });
        });
    });
  });

  describe("for saved questions - metabase#10803", () => {
    it("should format the date properly", () => {
      cy.request("POST", "/api/card", {
        name: "10803",
        dataset_query: {
          type: "native",
          native: {
            query:
              "SELECT PARSEDATETIME('2020-06-03', 'yyyy-MM-dd') AS \"birth_date\", PARSEDATETIME('2020-06-03 23:41:23', 'yyyy-MM-dd hh:mm:ss') AS \"created_at\"",
            "template-tags": {},
          },
          database: 1,
        },
        display: "table",
        description: null,
        visualization_settings: {},
        collection_id: null,
      }).then(({ body }) => {
        cy.wrap(testCases).each(testCase => {
          cy.log(`downloading a ${testCase.type} file`);
          const endpoint = `/api/card/${body.id}/query/${testCase.type}`;

          cy.request({
            url: endpoint,
            method: "POST",
            encoding: "binary",
          }).then(resp => {
            const workbook = xlsx.read(resp.body, {
              type: "binary",
              raw: true,
            });

            testWorkbookDatetimes(
              workbook,
              testCase.type,
              testCase.firstSheetName,
            );
          });
        });
      });
    });
  });

  describe("for unsaved questions - metabase#10803", () => {
    it("should format the date properly", () => {
      // Find existing question "10803"
      cy.visit("/collection/root");
      cy.findByText("10803").click();
      cy.contains(/open editor/i).click();
      cy.get(".ace_editor").type("{movetoend} "); // Adds a space at the end of the query to make it "dirty"
      cy.get(".Icon-play")
        .first()
        .click();
      cy.get(".Icon-download").click();

      cy.wrap(testCases).each(testCase => {
        cy.log(`downloading a ${testCase.type} file`);
        const downloadClassName = `.Icon-${testCase.type}`;
        const endpoint = `/api/dataset/${testCase.type}`;

        cy.get(downloadClassName)
          .parent()
          .parent()
          .get('input[name="query"]')
          .invoke("val")
          .then(download_query_params => {
            cy.request({
              url: endpoint,
              method: "POST",
              form: true,
              body: { query: download_query_params },
              encoding: "binary",
            }).then(resp => {
              const workbook = xlsx.read(resp.body, {
                type: "binary",
                raw: true,
              });

              testWorkbookDatetimes(
                workbook,
                testCase.type,
                testCase.firstSheetName,
              );
            });
          });
      });
    });
  });

  it.skip("should respect the 'Report Timezone' setting (metabase#13677)", () => {
    const SET_TIMEZONE = "Europe/Brussels";
    cy.server();

    cy.log(`**--- Setting the timezone to: ${SET_TIMEZONE} ---**`);
    cy.request("PUT", "/api/setting/report-timezone", {
      value: SET_TIMEZONE,
    });

    cy.request("POST", "/api/card", {
      name: "13677",
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT current_date, date_trunc('day',current_date) AS day, date_trunc('week',current_date) AS week, date_trunc('month',current_date) AS month, date_trunc('quarter',current_date) AS quarter",
          "template-tags": {},
        },
        database: 1,
      },
      display: "table",
      visualization_settings: {},
    }).then(({ body }) => {
      cy.route("POST", `/api/card/${body.id}/query`).as("cardQuery");
      cy.visit(`/question/${body.id}`);

      cy.log("**Reported failing on v0.37.2**");
      cy.wait("@cardQuery").then(xhr => {
        const RESULTING_TIMEZONE = xhr.response.body.data.results_timezone;
        expect(RESULTING_TIMEZONE).to.eq(SET_TIMEZONE);
      });
    });
  });
});
