import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const URL_CASES = [
  {
    option: "Path",
    example: "/en/docs/feature",
  },
];

describe("extract action", { viewportWidth: 1600 }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("date columns", () => {
    describe("should add a new column after the selected column", () => {
      it("ad-hoc question", () => {
        H.openOrdersTable();
        extractColumnAndCheck({
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });

      it("saved question without viz settings", () => {
        H.visitQuestion(ORDERS_QUESTION_ID);
        extractColumnAndCheck({
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });

      it("saved question with viz settings", () => {
        H.createQuestion(
          {
            query: {
              "source-table": ORDERS_ID,
              fields: [
                ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
                ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
                ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
              ],
            },
            visualization_settings: {
              "table.columns": [
                {
                  name: "ID",
                  fieldRef: ["field", ORDERS.ID, null],
                  enabled: true,
                },
                {
                  name: "CREATED_AT",
                  fieldRef: [
                    "field",
                    ORDERS.CREATED_AT,
                    {
                      "temporal-unit": "default",
                    },
                  ],
                  enabled: true,
                },
                {
                  name: "QUANTITY",
                  fieldRef: ["field", ORDERS.QUANTITY, null],
                  enabled: true,
                },
              ],
            },
          },
          { visitQuestion: true },
        );
        extractColumnAndCheck({
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });
    });

    it("should be able to modify the expression in the notebook editor", () => {
      H.openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "Year",
        value: "2,028",
        extraction: "Extract day, month…",
      });
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Year").click();
      H.enterCustomColumnDetails({
        formula: "year([Created At]) + 2",
        format: true,
      });
      H.popover().button("Update").should("not.be.disabled").click();
      H.visualize();
      cy.findByRole("gridcell", { name: "2,030" }).should("be.visible");
    });

    it("should use current user locale for string expressions", () => {
      cy.request("GET", "/api/user/current").then(({ body: user }) => {
        cy.request("PUT", `/api/user/${user.id}`, { locale: "en-ZZ" });
      });
      H.openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "[zz] Day of week",
        // dayjs has no en-ZZ locale, so it falls back to English day names
        value: "Friday",
        extraction: "[zz] Extract day, month…",
      });
    });
  });

  describe("url columns", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      // Make the Email column a URL column for these tests, to avoid having to create a new model
      cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
        semantic_type: "type/URL",
      });
    });

    URL_CASES.forEach(({ option, value, example }) => {
      it(option, () => {
        H.openPeopleTable({ limit: 1 });

        extractColumnAndCheck({
          column: "Email",
          option,
          value,
          example,
          extraction: "Extract domain, subdomain…",
        });
      });
    });

    it("should be able to extract path from URL column", () => {
      function assertTableData({ title, value }) {
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.tableInteractive()
          .findAllByTestId("header-cell")
          .last()
          .should("have.text", title);

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.tableInteractiveBody()
          .findAllByTestId("cell-data")
          .last()
          .should("have.text", value);
      }

      const CC_NAME = "URL_URL";
      const questionDetails = {
        name: "path from url",
        query: {
          "source-table": PEOPLE_ID,
          limit: 1,
          expressions: {
            [CC_NAME]: [
              "concat",
              "http://",
              ["domain", ["field", PEOPLE.EMAIL, null]],
              ".com/my/path",
            ],
          },
        },
        type: "model",
      };

      H.createQuestion(questionDetails).then(({ body: { id: modelId } }) => {
        // set semantic type to URL
        H.setModelMetadata(modelId, (field) => {
          if (field.name === CC_NAME) {
            return { ...field, semantic_type: "type/URL" };
          }

          return field;
        });

        // this is the way to open model definition with columns
        cy.visit(`/model/${modelId}/query`);
        cy.findByTestId("dataset-edit-bar").findByText("Cancel").click();
      });

      cy.findByTestId("table-scroll-container").scrollTo("right");

      const urlCase = URL_CASES.find((c) => c.option === "Path");
      extractColumnAndCheck({
        column: CC_NAME,
        option: urlCase.option,
        example: urlCase.example,
        extraction: "Extract domain, subdomain…",
      });

      const extractedValue = "/my/path";
      assertTableData({
        title: "Path",
        value: extractedValue,
      });
    });
  });
});

function extractColumnAndCheck({
  column,
  option,
  newColumn = option,
  extraction,
  value,
  example,
}) {
  const requestAlias = _.uniqueId("dataset");
  cy.intercept("POST", "/api/dataset").as(requestAlias);
  H.tableHeaderClick(column);

  H.popover().findByText(extraction).click();
  cy.wait(1);

  if (example) {
    H.popover().findByText(option).should("contain", example);
  }

  H.popover().findByText(option).click();
  cy.wait(`@${requestAlias}`);

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByRole("columnheader")
    .last()
    .scrollIntoView()
    .should("have.text", newColumn)
    .and("be.visible");

  if (value) {
    cy.findByRole("gridcell", { name: value }).should("be.visible");
  }
}

describe("extract action", { viewportWidth: 1600 }, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should create a snowplow event for the column extraction action", () => {
    H.openOrdersTable({ limit: 1 });

    cy.wait(1);

    extractColumnAndCheck({
      column: "Created At",
      option: "Year",
      value: "2,028",
      extraction: "Extract day, month…",
    });

    H.expectUnstructuredSnowplowEvent({
      event: "column_extract_via_column_header",
      custom_expressions_used: ["get-year"],
      database_id: SAMPLE_DB_ID,
    });
  });
});
