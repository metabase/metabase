const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type {
  CardId,
  Parameter,
  TemplateTag,
  ValuesSourceConfig,
} from "metabase-types/api";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const TAG_ID = "49596bcb-62bb-49d6-a92d-bf5dbfddf43b";

describe("scenarios > filters > sql filters > multiple values", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  const VARIABLES = [
    {
      type: "text",
      parameterType: "string/=",
      query: "SELECT * FROM products WHERE category IN ({{tag}})",
      values: ["Gadget", "Widget"],
    },
    {
      type: "number",
      parameterType: "number/=",
      query: "SELECT ID FROM products WHERE ID IN ({{tag}})",
      values: ["10", "20"],
    },
  ] as const;

  VARIABLES.forEach(({ type, parameterType, query, values }) => {
    it(`should allow multiple values for ${type} variables in regular, public, and embedded questions`, () => {
      const questionDetails: NativeQuestionDetails = {
        name: "SQL",
        native: {
          query,
          "template-tags": {
            tag: {
              id: TAG_ID,
              name: "tag",
              "display-name": "Tag",
              type,
            },
          },
        },
        parameters: [
          {
            id: TAG_ID,
            type: parameterType,
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
  });

  function setMultipleValues(values: readonly string[]) {
    H.filterWidget().click();
    H.popover().within(() => {
      H.multiAutocompleteInput().type(values.join(","));
      cy.button("Add filter").click();
    });
  }

  function assertValuesInTable(values: readonly string[]) {
    H.tableInteractive().within(() => {
      values.forEach((value) => {
        cy.findAllByText(value).should("have.length.gte", 1);
      });
    });
  }
});

describe("scenarios > filters > sql filters > values source", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/card/*/params/*/values").as(
      "cardParameterValues",
    );
  });

  it("should use the values of a structured question for a text variable", () => {
    const sourceQuestionDetails: StructuredQuestionDetails = {
      name: "MBQL source",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
        filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
      },
    };

    H.createQuestion(sourceQuestionDetails).then(
      ({ body: { id: sourceCardId } }) => {
        createNativeQuestionWithCardSource({
          query: "SELECT * FROM PRODUCTS WHERE CATEGORY = {{tag}}",
          tag: { type: "text" },
          parameterType: "string/=",
          sourceConfig: {
            card_id: sourceCardId,
            value_field: ["field", PRODUCTS.CATEGORY, null],
          },
        });
      },
    );

    H.filterWidget().click();
    cy.wait("@cardParameterValues");
    H.popover().within(() => {
      cy.findByText("Gizmo").should("be.visible");
      cy.findByText("Doohickey").should("not.exist");
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });
    runSavedQuestion();
    H.assertQueryBuilderRowCount(51);
  });

  it("should use the values of a native question for a field filter", () => {
    const sourceQuestionDetails: NativeQuestionDetails = {
      name: "SQL source",
      native: {
        query: "SELECT '1018947080336' EAN UNION ALL SELECT '7663515285824'",
      },
    };

    H.createNativeQuestion(sourceQuestionDetails).then(
      ({ body: { id: sourceCardId } }) => {
        createNativeQuestionWithCardSource({
          query: "SELECT * FROM PRODUCTS WHERE {{tag}}",
          tag: {
            type: "dimension",
            dimension: ["field", PRODUCTS.EAN, null],
            "widget-type": "string/=",
          },
          parameterType: "string/=",
          sourceConfig: {
            card_id: sourceCardId,
            value_field: ["field", "EAN", { "base-type": "type/Text" }],
          },
        });
      },
    );

    H.filterWidget().click();
    cy.wait("@cardParameterValues");
    H.popover().within(() => {
      cy.findByText("1018947080336").should("be.visible");
      cy.findByText("0001664425970").should("not.exist");
      cy.findByText("1018947080336").click();
      cy.button("Add filter").click();
    });
    runSavedQuestion();
    H.assertQueryBuilderRowCount(1);
  });

  function createNativeQuestionWithCardSource({
    query,
    tag,
    parameterType,
    sourceConfig,
  }: {
    query: string;
    tag: Pick<TemplateTag, "type" | "dimension" | "widget-type">;
    parameterType: Parameter["type"];
    sourceConfig: ValuesSourceConfig;
  }) {
    H.createNativeQuestion(
      {
        name: "SQL filter",
        native: {
          query,
          "template-tags": {
            tag: { id: TAG_ID, name: "tag", "display-name": "Tag", ...tag },
          },
        },
        parameters: [
          {
            id: TAG_ID,
            type: parameterType,
            name: "Tag",
            slug: "tag",
            target:
              tag.type === "dimension"
                ? ["dimension", ["template-tag", "tag"]]
                : ["variable", ["template-tag", "tag"]],
            values_query_type: "list",
            values_source_type: "card",
            values_source_config: sourceConfig,
          },
        ],
      },
      { visitQuestion: true },
    );
  }

  function runSavedQuestion() {
    cy.findAllByTestId("run-button").first().click();
    cy.wait("@cardQuery");
  }
});
