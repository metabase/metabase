const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  DashboardDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type {
  CardId,
  DashboardParameterMapping,
  Parameter,
} from "metabase-types/api";

const { ORDERS, PRODUCTS, REVIEWS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > remapping", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    addInternalRemapping();
    addExternalRemapping();
  });

  describe("dashboards", () => {
    beforeEach(() => {
      createDashboard();
    });
  });
});

function addInternalRemapping() {
  cy.request("POST", `/api/field/${REVIEWS.RATING}/dimension`, {
    name: "Rating",
    type: "internal",
    human_readable_field_id: null,
  });

  cy.request("POST", `/api/field/${REVIEWS.RATING}/values`, {
    values: [
      [1, "A"],
      [2, "B"],
      [3, "C"],
      [4, "D"],
      [5, "E"],
    ],
  });
}

function addExternalRemapping() {
  cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

function createDashboard() {
  const questionDetails: StructuredQuestionDetails = {
    query: {
      "source-table": `card__${ORDERS_MODEL_ID}`,
    },
  };
  const internalParameter: Parameter = {
    id: "internal",
    name: "Internal",
    slug: "internal",
    type: "number/=",
  };
  const externalParameter: Parameter = {
    id: "external",
    name: "External",
    slug: "external",
    type: "id",
  };
  const pkNameParameter: Parameter = {
    id: "pk_name",
    name: "PK Name",
    slug: "pk-name",
    type: "id",
  };
  const fkNameParameter: Parameter = {
    id: "fk_name",
    name: "FK Name",
    slug: "fk-name",
    type: "id",
  };
  const dashboardDetails: DashboardDetails = {
    parameters: [
      internalParameter,
      externalParameter,
      pkNameParameter,
      fkNameParameter,
    ],
  };
  const getParameterMappings = (
    questionId: CardId,
  ): DashboardParameterMapping[] => {
    return [
      {
        parameter_id: internalParameter.id,
        card_id: questionId,
        target: [
          "dimension",
          ["field", "RATING", { "base-type": "type/Integer" }],
        ],
      },
      {
        parameter_id: externalParameter.id,
        card_id: questionId,
        target: [
          "dimension",
          ["field", "PRODUCT_ID", { "base-type": "type/Integer" }],
        ],
      },
      {
        parameter_id: pkNameParameter.id,
        card_id: questionId,
        target: [
          "dimension",
          ["field", "ID_3", { "base-type": "type/BigInteger" }],
        ],
      },
      {
        parameter_id: fkNameParameter.id,
        card_id: questionId,
        target: [
          "dimension",
          ["field", "USER_ID", { "base-type": "type/Integer" }],
        ],
      },
    ];
  };
  H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
    ({ body: { dashboard_id }, questionId }) => {
      H.updateDashboardCards({
        dashboard_id,
        cards: [{ parameter_mappings: getParameterMappings(questionId) }],
      });
      cy.wrap(dashboard_id).as("dashboardId");
    },
  );
}
