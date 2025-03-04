import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { GetFieldValuesResponse } from "metabase-types/api";

import type {
  DashcardQueryResponse,
  DatasetResponse,
  SandboxableItems,
} from "./types";

const { H } = cy;
const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;
const { PRODUCTS_ID } = SAMPLE_DATABASE;

type CustomColumnType = "boolean" | "string" | "number";
type CustomViewType = "Question" | "Model";

type SandboxPolicy = {
  filterTableBy: "column" | "custom_view";
  customViewType?: CustomViewType;
  customViewName?: string;
  customColumnType?: "number" | "string" | "boolean";
  filterColumn?: string;
};

const customColumnTypeToFormula: Record<CustomColumnType, string> = {
  boolean: '[Category]="Gizmo"',
  string: 'concat("Category is ",[Category])',
  number: 'if([Category] = "Gizmo", 1, 0)',
};

const addCustomColumnToQuestion = (customColumnType: CustomColumnType) => {
  cy.log("Add a custom column");
  H.getNotebookStep("expression").icon("add").click();
  H.enterCustomColumnDetails({
    formula: customColumnTypeToFormula[customColumnType],
    name: `my_${customColumnType}`,
  });
  H.popover().button("Done").click();
};

const baseQuery = {
  "source-table": PRODUCTS_ID,
  limit: 20,
};

const gizmoFilter = [
  "=",
  ["field", SAMPLE_DATABASE.PRODUCTS.CATEGORY, null],
  "Gizmo",
];

const questionData = [
  {
    name: "sandbox - All Products question",
    query: baseQuery,
  },
  {
    name: "sandbox - All Products model",
    query: baseQuery,
    type: "model",
  },
  {
    name: "sandbox - Question with only gizmos",
    query: {
      ...baseQuery,
      filter: gizmoFilter,
    },
  },
  {
    name: "sandbox - Model with only gizmos",
    query: {
      ...baseQuery,
      filter: gizmoFilter,
    },
    type: "model",
  },
];

export const adhocQuestionData = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": PRODUCTS_ID,
    },
  },
};

function addCustomColumnsToQuestion() {
  H.openNotebook();
  H.getNotebookStep("data").button("Custom column").click();
  addCustomColumnToQuestion("boolean");
  addCustomColumnToQuestion("number");
  addCustomColumnToQuestion("string");
  H.visualize();

  // for some reason we can't use the saveQuestion helper here
  cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  cy.findByTestId("qb-header").button("Save").click();
  H.modal().button("Save").click();
  cy.wait("@updateQuestion");
}

/**
 * creates all questions and models and puts them in a dashboard
 * all of them reside in a single collection
 */
export const createSandboxingDashboardAndQuestions = () => {
  H.createCollection({ name: "Sandboxing", alias: "sandboxingCollectionId" });

  return cy.get("@sandboxingCollectionId").then((collectionId: any) => {
    H.createDashboardWithQuestions({
      dashboardName: "Sandboxing Dashboard",
      dashboardDetails: { collection_id: collectionId },
      questions: questionData.map(questionDetails => ({
        ...questionDetails,
        collection_id: collectionId,
      })) as StructuredQuestionDetails[],
    }).then(({ dashboard, questions }) => {
      // nested question needs to be done after the saved question is created
      H.createQuestionAndAddToDashboard(
        {
          name: "sandbox - Nested question",
          query: {
            ...baseQuery,
            "source-table": `card__${questions[0].id}`,
          },
          collection_id: collectionId,
        },
        dashboard.id,
      );

      H.createQuestionAndAddToDashboard(
        {
          name: "sandbox - Question with custom columns",
          query: baseQuery,
          collection_id: collectionId,
        },
        dashboard.id,
      ).then((response: any) => {
        H.visitQuestion(response.body.card.id);
        addCustomColumnsToQuestion();

        // copy custom column question to a model
        cy.request("GET", `/api/card/${response.body.card.id}`).then(
          ({ body }) => {
            cy.request("POST", "/api/card", {
              ...body,
              name: "sandbox - Model with custom columns",
              type: "model",
            }).then(({ body }) => {
              H.addQuestionToDashboard({
                cardId: body.id,
                dashboardId: dashboard.id,
              });
            });
          },
        );
      });
    });

    // return the collection items
    return cy.request(`/api/collection/${collectionId}/items`);
  });
};

export const sandboxingUser = {
  email: "user@company.com",
  password: "--------",
  user_group_memberships: [
    { id: ALL_USERS_GROUP, is_group_manager: false },
    { id: DATA_GROUP, is_group_manager: false },
    { id: COLLECTION_GROUP, is_group_manager: false },
  ],
};

export const signInAsNormalUser = () => {
  cy.log(`Sign in as user via an API call: ${sandboxingUser.email}`);
  return cy.request("POST", "/api/session", {
    username: sandboxingUser.email,
    password: sandboxingUser.password,
  });
};

export const assignAttributeToUser = ({
  attributeKey = "filter-attribute",
  attributeValue,
}: {
  attributeKey?: string;
  attributeValue: string;
}) => {
  cy.request("GET", "/api/user")
    .then(response => {
      const userData = response.body.data.find(
        (user: { email: string }) => user.email === sandboxingUser.email,
      );
      return userData.id;
    })
    .then(userId => {
      return cy.request("GET", `/api/user/${userId}`);
    })
    .then(response => {
      const user = response.body;
      return user;
    })
    .then(user => {
      cy.request("PUT", `/api/user/${user.id}`, {
        ...user,
        login_attributes: {
          [attributeKey]: attributeValue,
        },
      });
    });
};

export const configureSandboxPolicy = (policy: SandboxPolicy) => {
  const { filterTableBy, customViewName, customViewType, filterColumn } =
    policy;

  cy.log(`Configure sandboxing policy: ${JSON.stringify(policy)}`);
  cy.log("Show the permissions configuration for the Sample Database");
  cy.visit("/admin/permissions/data/database/1");
  cy.log(
    "Show the permissions configuration for the Sample Database's Products table",
  );
  cy.findByRole("menuitem", { name: /Products/ }).click();
  cy.log("Modify the sandboxing policy for the 'data' group");
  H.modifyPermission("data", 0, "Sandboxed");

  H.modal().within(() => {
    cy.findByText(/Change access to this database to .*Sandboxed.*?/);
    cy.button("Change").click();
  });

  H.modal().findByText(/Restrict access to this table/);

  if (filterTableBy !== "custom_view") {
    cy.log("Filter by a column in the table");
    cy.findByRole("radio", {
      name: /Filter by a column in the table/,
    }).should("be.checked");
  } else if (customViewName) {
    cy.findByText(
      /Use a saved question to create a custom view for this table/,
    ).click();
    cy.findByTestId("custom-view-picker-button").click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(customViewType).click();
      cy.findByText(/Sandboxing/).click(); // collection name
      cy.findByText(customViewName).click();
    });
  }

  if (filterColumn) {
    H.modal()
      .findByRole("button", { name: /Pick a column|parameter/ })
      .click();
    cy.findByRole("option", { name: filterColumn }).click();
    H.modal()
      .findByRole("button", { name: /Pick a user attribute/ })
      .click();
    cy.findByRole("option", { name: "filter-attribute" }).click();
  }

  cy.log("Wait for the whole summary to render");
  cy.findByLabelText(/Summary/).contains("data");

  cy.log("Ensure the summary contains the correct text");
  cy.findByLabelText(/Summary/)
    .invoke("text")
    .should(summary => {
      expect(summary).to.contain("Users in data can view");
      if (filterColumn) {
        expect(summary).to.contain(`${filterColumn} field equals`);
      }
    });

  cy.log("Save the sandboxing modal");
  H.modal().findByRole("button", { name: "Save" }).click();

  H.saveChangesToPermissions();
};

export function rowsShouldContainGizmosAndWidgets(
  responses: DatasetResponse[],
) {
  responses.forEach(response => {
    expect(response.body.data.is_sandboxed).to.be.false;
  });

  const rows = responses.flatMap(response => response.body.data.rows);
  expect(
    rows.some(row => row.includes("Gizmo")),
    "at least one row should have a gizmo",
  ).to.be.true;
  expect(
    rows.some(row => row.includes("Widget")),
    "at least one row should have a widget",
  ).to.be.true;
}

export function rowsShouldContainOnlyGizmos(responses: DatasetResponse[]) {
  responses.forEach(response => {
    expect(response?.body.data.is_sandboxed).to.be.true;
  });

  const rows = responses.flatMap(response => response.body.data.rows);
  expect(
    rows.every(row => row.includes("Gizmo")),
    "every row should have a gizmo",
  ).to.be.true;
  expect(
    !rows.some(row => row.includes("Widget")),
    "no rows should have widgets",
  ).to.be.true;
}

export const getDashcardResponses = (items: SandboxableItems) => {
  signInAsNormalUser();

  H.visitDashboard(items.dashboard.id);

  expect(items.questions.length).to.be.greaterThan(0);
  return cy
    .wait(new Array(items.questions.length).fill("@dashcardQuery"))
    .then(interceptions => {
      const responses: DashcardQueryResponse[] = interceptions.map(
        i => i.response,
      );
      return responses;
    });
};

export const getCardResponses = (items: SandboxableItems) => {
  expect(items.questions.length).to.be.greaterThan(0);
  return H.cypressWaitAll(
    items.questions.map(question =>
      cy.request<DatasetResponse>("POST", `/api/card/${question.id}/query`),
    ),
  ) as Cypress.Chainable<DatasetResponse[]>;
};

export const getFieldValues = () =>
  cy.request<GetFieldValuesResponse>(
    "GET",
    `/api/field/${SAMPLE_DATABASE.PRODUCTS.CATEGORY}/values`,
  );
