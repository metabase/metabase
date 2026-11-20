const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { NativeQuestionDetails } from "e2e/support/helpers/api/createQuestion";
import type { CardId } from "metabase-types/api";

const { REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 23449", () => {
  const questionDetails = { query: { "source-table": REVIEWS_ID, limit: 2 } };
  function turnIntoModel() {
    cy.intercept("PUT", "/api/card/*").as("cardUpdate");
    cy.intercept("POST", "/api/dataset").as("modelQuery");

    H.openQuestionActions();
    cy.findByText("Turn into a model").click();
    cy.findByText("Turn this into a model").click();

    cy.wait("@cardUpdate");
    // Turning the question into a model re-runs its query
    cy.wait("@modelQuery").then(({ response }) => {
      expect(response, "model query response").to.exist;
      if (!response) {
        throw new Error("The model query got no response");
      }
      expect(response.body.error).to.not.exist;
    });
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
      type: "internal",
      name: "Rating",
    });

    cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
      values: [
        [1, "Awful"],
        [2, "Unpleasant"],
        [3, "Meh"],
        [4, "Enjoyable"],
        [5, "Perfecto"],
      ],
    });
  });

  it("should work with the remapped custom values from data model (metabase#23449)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    cy.findByTextEnsureVisible("Perfecto");

    turnIntoModel();
    H.tableInteractive().findByTextEnsureVisible("Perfecto");
  });
});

function mapModelColumnToDatabase({
  table,
  field,
}: {
  table: string;
  field: string;
}) {
  cy.findByText("Database column this maps to")
    .parent()
    .findByTestId("select-button")
    .click();
  H.popover().findByRole("option", { name: table }).click();
  H.popover().findByRole("option", { name: field }).click();
  cy.contains(`${table} → ${field}`).should("be.visible");
  cy.findAllByDisplayValue(field).should("exist");
  cy.findByLabelText("Description").should("not.have.value", "");
}

function selectModelColumn(column: string) {
  cy.findAllByTestId("header-cell").contains(column).click();
}

describe("issue 29517 - nested question based on native model with columns mapped to database fields", () => {
  const questionDetails: NativeQuestionDetails = {
    name: "29517",
    type: "model",
    native: {
      query:
        'Select Orders."ID" AS "ID",\nOrders."CREATED_AT" AS "CREATED_AT"\nFrom Orders',
      "template-tags": {},
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept(
        "GET",
        `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC?can-query=true`,
      ).as("schema");
      cy.visit(`/model/${id}/columns`);
      cy.wait("@schema");

      mapModelColumnToDatabase({ table: "Orders", field: "ID" });
      selectModelColumn("CREATED_AT");
      mapModelColumnToDatabase({ table: "Orders", field: "Created At" });

      cy.intercept("PUT", "/api/card/*").as("updateModel");
      cy.button("Save changes").click();
      cy.wait("@updateModel");

      const nestedQuestionDetails: StructuredQuestionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT",
              { "temporal-unit": "month", "base-type": "type/DateTime" },
            ],
          ],
        },
        display: "line",
      };

      H.createQuestionAndDashboard({
        questionDetails: nestedQuestionDetails,
      }).then(({ body: card }) => {
        const { dashboard_id } = card;

        H.editDashboardCard(card, {
          visualization_settings: {
            click_behavior: {
              type: "link",
              linkType: "dashboard",
              targetId: ORDERS_DASHBOARD_ID,
              parameterMapping: {},
            },
          },
        });

        cy.wrap(dashboard_id).as("dashboardId");
      });
    });
  });

  it("click behavior to custom destination should work (metabase#29517)", () => {
    H.visitDashboard("@dashboardId");

    cy.intercept("GET", `/api/dashboard/${ORDERS_DASHBOARD_ID}*`).as(
      "loadTargetDashboard",
    );
    cy.intercept("/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
    H.cartesianChartCircle().eq(25).click({ force: true });
    cy.wait("@loadTargetDashboard");

    cy.location("pathname").should("eq", `/dashboard/${ORDERS_DASHBOARD_ID}`);

    cy.wait("@dashcardQuery");

    H.getDashboardCard().findAllByText("37.65").should("be.visible");
  });
});

describe("issue 53556 - nested question based on native model with columns mapped to database fields", () => {
  const questionDetails: NativeQuestionDetails = {
    name: "53556",
    type: "model",
    native: {
      query:
        "Select " +
        'Orders."ID" AS "ID", ' +
        'Orders."CREATED_AT" AS "CREATED_AT_ALIAS", ' +
        'Orders."TOTAL" AS "TOTAL_ALIAS" ' +
        "From Orders",
      "template-tags": {},
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.intercept(
        "GET",
        `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC?can-query=true`,
      ).as("schema");
      cy.visit(`/model/${id}/columns`);
      cy.wait("@schema");

      mapModelColumnToDatabase({ table: "Orders", field: "ID" });
      selectModelColumn("CREATED_AT_ALIAS");
      mapModelColumnToDatabase({ table: "Orders", field: "Created At" });
      selectModelColumn("TOTAL_ALIAS");
      mapModelColumnToDatabase({ table: "Orders", field: "Total" });

      cy.intercept("PUT", "/api/card/*").as("updateModel");
      cy.button("Save changes").click();
      cy.wait("@updateModel");

      const nestedQuestionDetails: StructuredQuestionDetails = {
        query: {
          "source-table": `card__${id}`,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              "CREATED_AT_ALIAS",
              { "temporal-unit": "month", "base-type": "type/DateTime" },
            ],
            [
              "field",
              "TOTAL_ALIAS",
              { binning: { strategy: "default" }, "base-type": "type/Float" },
            ],
          ],
        },
        display: "line",
      };

      H.createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "nestedQuestionId",
      });
    });
  });

  it("Sort drill-through should work (metabase#53556)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.visitQuestion("@nestedQuestionId");

    cy.findByLabelText("Switch to data").click();
    H.assertQueryBuilderRowCount(312);

    cy.log("Sort by Total in descending order");
    H.tableHeaderClick("Total: 8 bins");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.descending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["January 2027", "140  –  160", "18"],
        ["February 2027", "140  –  160", "17"],
      ],
    });

    cy.log("Sort by Total in ascending order");
    H.tableHeaderClick("Total: 8 bins");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.ascending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["December 2026", "-60  –  -40", "1"],
        ["September 2025", "0  –  20", "2"],
      ],
    });

    cy.log("Sort by Created At in descending order");
    H.tableHeaderClick("Created At: Month");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.descending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["April 2029", "20  –  40", "27"],
        ["April 2029", "40  –  60", "57"],
      ],
    });

    cy.log("Sort by Created At in ascending order");
    H.tableHeaderClick("Created At: Month");
    H.popover()
      .findAllByTestId("click-actions-sort-control-sort.ascending")
      .click();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(312);
    H.assertTableData({
      columns: ["Created At: Month", "Total: 8 bins", "Count"],
      firstRows: [
        ["April 2025", "40  –  60", "1"],
        ["May 2025", "20  –  40", "1"],
      ],
    });
  });
});
describe("issue 40252", () => {
  const modelA: NativeQuestionDetails = {
    name: "Model A",
    native: { query: "select 1 as a1, 2 as a2" },
    type: "model",
  };

  const modelB: NativeQuestionDetails = {
    name: "Model B",
    native: { query: "select 1 as b1, 2 as b2" },
    type: "model",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shouldn't crash during save of metadata (metabase#40252)", () => {
    H.createNativeQuestion(modelA, { wrapId: true, idAlias: "modelA" });
    H.createNativeQuestion(modelB, { wrapId: true, idAlias: "modelB" });

    cy.get<CardId>("@modelA").then((modelAId) => {
      cy.get<CardId>("@modelB").then((modelBId) => {
        const questionDetails: StructuredQuestionDetails = {
          name: "40252",
          type: "model",
          query: {
            joins: [
              {
                fields: "all",
                alias: "Model B - A1",
                strategy: "inner-join",
                condition: [
                  "=",
                  [
                    "field",
                    "A1",
                    {
                      "base-type": "type/Integer",
                    },
                  ],
                  [
                    "field",
                    "B1",
                    {
                      "base-type": "type/Integer",
                      "join-alias": "Model B - A1",
                    },
                  ],
                ],
                "source-table": `card__${modelBId}`,
              },
            ],
            "source-table": `card__${modelAId}`,
          },
        };

        H.createQuestion(questionDetails, { visitQuestion: true });
      });
    });

    H.openQuestionActions();

    H.popover().findByText("Edit metadata").click();

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1").click();
    cy.findByLabelText("Display name").type("Upd");

    //Because the field is debounced, we wait to see it in the metadata editor table before saving
    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1Upd");
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.findByTestId("dataset-edit-bar")
      .findByRole("button", { name: "Save changes" })
      .should("be.enabled")
      .click();

    cy.url().should("not.contain", "/columns");

    cy.wait("@dataset");

    cy.findAllByTestId("header-cell").contains("Model B - A1 → B1Upd");
  });
});

describe("issue 42355", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow overriding database fields for models with manually ordered columns (metabase#42355)", () => {
    // Columns saved by older versions also carry `key` and `fieldRef`
    const tableColumns = [
      {
        name: "PRODUCT_ID",
        key: '["name","PRODUCT_ID"]',
        enabled: true,
        fieldRef: ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
      },
      {
        name: "ID",
        key: '["name","ID"]',
        enabled: true,
        fieldRef: ["field", "ID", { "base-type": "type/BigInteger" }],
      },
    ];
    H.createNativeQuestion({
      type: "model",
      native: { query: "SELECT ID, PRODUCT_ID FROM ORDERS" },
      visualization_settings: {
        "table.columns": tableColumns,
        "table.cell_column": "ID",
      },
    }).then(({ body: card }) => H.visitModel(card.id));

    cy.log("update metadata");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("None")
      .click();
    H.popover().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("ID").click();
    });
    cy.button("Save changes").click();

    cy.log("check metadata changes are visible");
    H.openQuestionActions();
    H.popover().findByText("Edit metadata").click();
    H.rightSidebar()
      .findByText("Database column this maps to")
      .next()
      .findByText("Orders → ID")
      .should("be.visible");
  });
});
