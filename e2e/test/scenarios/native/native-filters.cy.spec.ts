const { H } = cy;

import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { NativeQuestionDetails } from "e2e/support/helpers";
import type { CardId, GetFieldValuesResponse } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { enterParameterizedQuery } from "./helpers/e2e-sql-filter-helpers";

const { ORDERS, PRODUCTS, PRODUCTS_ID, PEOPLE } = SAMPLE_DATABASE;
const { COLLECTION_GROUP } = USER_GROUPS;
const TAG_ID = "49596bcb-62bb-49d6-a92d-bf5dbfddf43b";

describe("scenarios > native > filters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should allow multiple values for a variable in regular, public, and embedded questions", () => {
    const values = ["Gadget", "Widget"];
    const questionDetails: NativeQuestionDetails = {
      name: "SQL",
      native: {
        query: "SELECT * FROM products WHERE category IN ({{tag}})",
        "template-tags": {
          tag: { id: TAG_ID, name: "tag", "display-name": "Tag", type: "text" },
        },
      },
      parameters: [
        {
          id: TAG_ID,
          type: "string/=",
          name: "Tag",
          slug: "tag",
          target: ["variable", ["template-tag", "tag"]],
          isMultiSelect: true,
        },
      ],
      enable_embedding: true,
      embedding_params: { tag: "enabled" },
    };

    cy.log("regular question");
    H.createNativeQuestion(questionDetails, {
      visitQuestion: true,
      wrapId: true,
    });
    setMultipleValues(values);
    cy.findAllByTestId("run-button").first().click();
    cy.wait("@cardQuery");
    assertValuesInTable(values);

    cy.log("public question");
    cy.get<CardId>("@questionId").then((questionId) =>
      H.visitPublicQuestion(questionId),
    );
    setMultipleValues(values);
    assertValuesInTable(values);

    cy.log("embedded question");
    cy.get<CardId>("@questionId").then((questionId) =>
      H.visitEmbeddedPage({
        resource: { question: questionId },
        params: {},
      }),
    );
    setMultipleValues(values);
    assertValuesInTable(values);
  });

  it("should search the values of a variable in its saved question source", () => {
    H.createQuestion({
      name: "Category source",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
        filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
      },
    }).then(({ body: sourceCard }) => {
      H.createNativeQuestion(
        {
          name: "SQL",
          native: {
            query: "SELECT * FROM products WHERE category IN ({{category}})",
            "template-tags": {
              category: {
                id: TAG_ID,
                name: "category",
                "display-name": "Category",
                type: "text",
              },
            },
          },
          parameters: [
            {
              id: TAG_ID,
              type: "string/=",
              name: "Category",
              slug: "category",
              target: ["variable", ["template-tag", "category"]],
              isMultiSelect: true,
              values_query_type: "search",
              values_source_type: "card",
              values_source_config: {
                card_id: sourceCard.id,
                value_field: ["field", PRODUCTS.CATEGORY, null],
              },
            },
          ],
        },
        { visitQuestion: true },
      );
    });
    cy.intercept("GET", "/api/card/*/params/*/search/*").as("searchValues");

    H.filterWidget().click();
    H.fieldValuesCombobox().type("Doo");
    cy.wait("@searchValues");
    cy.findByRole("option", { name: "Doohickey" }).should("not.exist");

    H.fieldValuesCombobox().clear().type("Giz");
    cy.wait("@searchValues");
    cy.findByRole("option", { name: "Gizmo" }).click();
    H.fieldValuesValue(0).should("contain", "Gizmo");
    H.popover().button("Add filter").click();

    cy.findAllByTestId("run-button").first().click();
    cy.wait("@cardQuery");
    H.assertQueryBuilderRowCount(51);
  });

  it("should show the filters in a toggleable list on small screens", () => {
    H.createNativeQuestion(
      {
        name: "SQL",
        native: {
          query: "SELECT * FROM products WHERE category = {{category}}",
          "template-tags": {
            category: {
              id: TAG_ID,
              name: "category",
              "display-name": "Category",
              type: "text",
              default: "Gizmo",
            },
          },
        },
      },
      { visitQuestion: true },
    );
    cy.viewport(480, 800);

    filterInput().should("not.be.visible");

    cy.button(/1 active filter/).click();
    filterInput().should("be.visible").and("have.value", "Gizmo");

    cy.button("Close").click();
    filterInput().should("not.be.visible");
  });

  function filterInput() {
    return H.filterWidget().findByRole("textbox");
  }

  function setMultipleValues(values: string[]) {
    H.filterWidget().click();
    H.popover().within(() => {
      H.multiAutocompleteInput().type(values.join(","));
      cy.button("Add filter").click();
    });
  }

  function assertValuesInTable(values: string[]) {
    H.tableInteractive().within(() => {
      values.forEach((value) => {
        cy.findAllByText(value).should("have.length.gte", 1);
      });
    });
  }
});

describe("scenarios > native > filters > remapping", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    addInternalRemapping();
    addExternalRemapping();
  });

  it("should remap native question parameter values", () => {
    createQuestion().then((questionId) => {
      H.visitQuestion(questionId);
      testWidgetsRemapping();

      H.visitPublicQuestion(questionId);
      testWidgetsRemapping();

      H.visitEmbeddedPage({
        resource: { question: questionId },
        params: {},
      });
      testWidgetsRemapping();
    });
  });
});

describe("issue 9357", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "should reorder template tags by drag and drop, but not from popovers (metabase#9357, metabase#40232)",
    { viewportWidth: 800, viewportHeight: 600 },
    () => {
      H.startNewNativeQuestion();
      enterParameterizedQuery(
        "{{firstparameter}} {{nextparameter}} {{lastparameter}}",
      );

      // Drag the firstparameter below the nextparameter
      H.filterWidget().findAllByRole("listitem").first().as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: 50,
        useMouseEvents: true,
      });

      // Ensure they're in the right order
      cy.findAllByText("Variable name").parent().as("variableField");

      cy.get("@variableField").first().findByText("nextparameter");

      cy.get("@variableField").eq(1).findByText("firstparameter");

      cy.log(
        "dragging from inside a filter popover does not reorder the filters (metabase#40232)",
      );
      cy.findAllByRole("radio", { name: "Search box" }).first().click();
      H.filterWidget().first().should("contain.text", "Nextparameter").click();

      H.popover().findByText("Add filter").as("popoverElement");
      H.moveDnDKitElementByAlias("@popoverElement", {
        horizontal: 300,
      });

      H.filterWidget()
        .should("have.length", 3)
        .first()
        .should("contain.text", "Nextparameter");
    },
  );
});

describe("issue 12581", () => {
  const ORIGINAL_QUERY = "SELECT * FROM ORDERS WHERE {{filter}} LIMIT 2";

  const questionDetails: NativeQuestionDetails = {
    name: "12581",
    native: {
      query: ORIGINAL_QUERY,
      "template-tags": {
        filter: {
          id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", ORDERS.CREATED_AT, null],
          "widget-type": "date/month-year",
          default: null,
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("should correctly display a revision state after a restore (metabase#12581)", () => {
    // Start with the original version of the question made with API
    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .click();
    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .should("not.exist");

    H.NativeEditor.clear().type("SELECT 1");

    H.queryBuilderHeader().button("Save").click();

    cy.findByTestId("save-question-modal").within(() => {
      cy.findByText("Save").click();
    });

    cy.reload();
    cy.wait("@cardQuery");

    cy.findByTestId("revision-history-button").click();
    H.sidesheet().within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      // Make sure sidebar opened and the history loaded
      cy.findByText(/You created this/i);

      cy.findByTestId("question-revert-button").click(); // Revert to the first revision
    });

    // Reverting reloads the question, which re-runs its query and resets the
    // info sidesheet to the Overview tab. Wait for that reload to settle before
    // re-reading the History tab, otherwise the tab switch races the reset.
    cy.wait("@cardQuery");

    H.sidesheet().within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/You reverted to an earlier version/i);
    });

    cy.findByLabelText("Close").click();

    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .click();

    H.NativeEditor.get().should("be.visible").and("contain", ORIGINAL_QUERY);

    H.tableInteractive().findByText("37.65");

    H.filterWidget().contains("Filter");
  });
});

["nodata+nosql", "nosql"].forEach((variant) => {
  describe(`issue 15163 (${variant})`, () => {
    const dashboardFilter = {
      name: "Category",
      slug: "category",
      id: "fd723065",
      type: "category",
    };

    const questionDetails: NativeQuestionDetails = {
      name: "15163",
      native: {
        query: 'SELECT COUNT(*) FROM "PRODUCTS" WHERE {{cat}}',
        "template-tags": {
          cat: {
            id: "dd7f3e66-b659-7d1c-87b3-ab627317581c",
            name: "cat",
            "display-name": "Cat",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "category",
            default: null,
          },
        },
      },
    };

    beforeEach(() => {
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      H.restore();
      cy.signInAsAdmin();

      H.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails: { parameters: [dashboardFilter] },
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 13,
              size_y: 8,
              series: [],
              visualization_settings: {
                "card.title": "New Title",
              },
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id,
                  target: ["dimension", ["template-tag", "cat"]],
                },
              ],
            },
          ],
        });

        if (variant === "nosql") {
          cy.updatePermissionsGraph({
            [COLLECTION_GROUP]: {
              1: {
                "view-data": "unrestricted",
                "create-queries": "query-builder",
              },
            },
          });
        }

        cy.signIn("nodata");

        cy.visit(`/dashboard/${dashboard_id}?category=Gizmo`);
      });
    });

    it("should be able to view SQL question when accessing via dashboard with filters connected to modified card without SQL permissions (metabase#15163)", () => {
      H.getDashboardCard().findByText("New Title").click();

      cy.wait("@cardQuery").its("response.body.error").should("not.exist");

      cy.findAllByTestId("cell-data").should("contain", "51");
      H.assertQueryBuilderRowCount(1);
      H.NativeEditor.get().should("not.exist");
    });
  });
});

function addInternalRemapping() {
  cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
    name: "Quantity",
    type: "internal",
    human_readable_field_id: null,
  });

  cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
    ({ body }: { body: GetFieldValuesResponse }) => {
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/values`, {
        values: body.values.map(([value]) => [value, `N${value}`]),
      });
    },
  );
}

function addExternalRemapping() {
  cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

function createQuestion() {
  const questionDetails: NativeQuestionDetails = {
    name: "Orders native question",
    native: {
      query:
        "SELECT * " +
        "FROM ORDERS " +
        "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
        "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
      "template-tags": {
        quantity: {
          id: "quantity",
          name: "quantity",
          "display-name": "Internal",
          type: "dimension",
          "widget-type": "number/=",
          dimension: ["field", ORDERS.QUANTITY, null],
        },
        product_id_fk: {
          id: "product_id_fk",
          name: "product_id_fk",
          "display-name": "FK",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
        },
        user_id_pk: {
          id: "user_id_pk",
          name: "user_id_pk",
          "display-name": "PK->Name",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", PEOPLE.ID, null],
        },
      },
    },
    parameters: [
      createMockParameter({
        id: "quantity",
        name: "Internal",
        slug: "quantity",
        type: "number/=",
        target: ["dimension", ["template-tag", "quantity"]],
      }),
      createMockParameter({
        id: "product_id_fk",
        name: "FK",
        slug: "product_id_fk",
        type: "id",
        target: ["dimension", ["template-tag", "product_id_fk"]],
      }),
      createMockParameter({
        id: "user_id_pk",
        name: "PK->Name",
        slug: "user_id_pk",
        type: "id",
        target: ["dimension", ["template-tag", "user_id_pk"]],
      }),
    ],
    enable_embedding: true,
    embedding_params: {
      quantity: "enabled",
      product_id_fk: "enabled",
      user_id_pk: "enabled",
    },
  };

  return H.createNativeQuestion(questionDetails).then(({ body }) => body.id);
}

function testWidgetsRemapping() {
  cy.log("internal remapping");
  H.filterWidget({ name: "Internal" }).click();
  H.popover().within(() => {
    cy.findByText("N5").click();
    cy.button("Add filter").click();
  });
  H.filterWidget({ name: "Internal" }).should("contain.text", "N5");

  cy.log("FK remapping");
  H.filterWidget({ name: "FK" }).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Rustic Paper Wallet").should("exist");
    cy.button("Add filter").click();
  });
  H.filterWidget({ name: "FK" }).should("contain.text", "Rustic Paper Wallet");

  cy.log("PK->Name remapping");
  H.filterWidget({ name: "PK->Name" }).click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Hudson Borer").should("exist");
    cy.button("Add filter").click();
  });
  H.filterWidget({ name: "PK->Name" }).should("contain.text", "Hudson Borer");
}
