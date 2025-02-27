import { P, match } from "ts-pattern";

import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createDashboard,
  createQuestion,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalTab,
  filter,
  getNotebookStep,
  modal,
  modifyPermission,
  openNotebook,
  popover,
  saveChangesToPermissions,
  saveQuestion,
  startNewQuestion,
  visitMetric,
  visitModel,
  visitQuestion,
} from "e2e/support/helpers";
import type { CardType, StructuredQuery } from "metabase-types/api";

const { ALL_USERS_GROUP, DATA_GROUP, COLLECTION_GROUP } = USER_GROUPS;

const { PRODUCTS_ID } = SAMPLE_DATABASE;

type ColumnType = "regular" | "custom";

/** A string describing the data type of a custom column. This is not a mistake
 * - it's a string with three possible values */
type CustomColumnType = "boolean" | "string" | "number";

type CustomViewType = "question" | "model";

const customColumnTypeToFormula: Record<CustomColumnType, string> = {
  boolean: '[Category]="Gizmo"',
  string: 'concat("Category is ",[Category])',
  number: 'if([Category] = "Gizmo", 1, 0)',
};

const addCustomColumnToQuestion = (customColumnType: CustomColumnType) => {
  cy.log("Add a custom column");
  getNotebookStep("data").button("Custom column").click();
  enterCustomColumnDetails({
    formula: customColumnTypeToFormula[customColumnType],
    name: "Custom category column",
  });
  popover().button("Done").click();
};

type CreateQuestionOptions = {
  columnType?: ColumnType;
  customColumnType?: CustomColumnType;
  idAlias?: string;
  dashboardName?: string;
  dashboardIdAlias?: string;
  dashcardIdAlias?: string;
  sourceTable?: StructuredQuery["source-table"];
  type?: CardType;
};

const createSavedQuestion = (opts: CreateQuestionOptions) => {
  cy.log(
    "Create a saved question that shows Gizmos and Widgets, and put it in a dashboard",
  );
  createCard({
    ...opts,
    idAlias: "savedQuestionId",
    dashboardName: "Dashboard with saved question",
    dashboardIdAlias: "idOfDashboardWithSavedQuestion",
    dashcardIdAlias: "savedQuestionDashcardId",
  });
};

const createModel = (opts: CreateQuestionOptions) => {
  cy.log(
    "Create a model that shows Gizmos and Widgets, and put it in a dashboard",
  );
  createCard({
    ...opts,
    type: "model",
    idAlias: "modelId",
    dashboardName: "Dashboard with model",
    dashboardIdAlias: "idOfDashboardWithModel",
    dashcardIdAlias: "modelDashcardId",
  });
};

const createCard = ({
  columnType,
  customColumnType,
  idAlias = "cardId",
  dashboardName = "Test Dashboard",
  dashboardIdAlias = "dashboardId",
  dashcardIdAlias = "dashcardId",
  sourceTable = PRODUCTS_ID,
  type = "question",
}: CreateQuestionOptions) => {
  createQuestion(
    {
      name: "Products question",
      query: {
        "source-table": sourceTable,
      },
      type,
    },
    { wrapId: true, idAlias },
  );

  cy.get("@" + idAlias).then(cardId => {
    isNumber(cardId);
    createDashboard(
      {
        name: dashboardName,
        dashcards: [
          {
            id: 1,
            size_x: 10,
            size_y: 20,
            row: 0,
            col: 0,
            card_id: cardId,
          },
        ],
      },
      {
        wrapId: true,
        idAlias: dashboardIdAlias,
        dashcardIdAliases: [dashcardIdAlias],
      },
    );
  });

  const visitCard = () => {
    // Get a function that will visit the card
    const visit = match(type)
      .returnType<(id: number) => void>()
      .with("question", () => visitQuestion)
      .with("model", () => visitModel)
      .with("metric", () => visitMetric)
      .exhaustive();

    // Call the function with the id of the saved question, model, or metric
    cy.get("@" + idAlias).then(id => visit(id as unknown as number));
  };

  if (customColumnType) {
    if (!columnType) {
      throw new Error(
        "columnType is required when customColumnType is provided",
      );
    }
    visitCard();
    addCustomColumnToCardAndSave(type, columnType, customColumnType, idAlias);
  }
};

const addCustomColumnToCardAndSave = (
  cardType: CardType,
  columnType: ColumnType,
  customColumnType: CustomColumnType,
  idAlias: string,
) => {
  cy.log("Add a custom column to the question");
  openNotebook();
  addCustomColumnToQuestion(customColumnType);
  cy.button("Visualize").click();
  const { attributeValue } = getUserAttribute(columnType, customColumnType);
  cy.findAllByText(attributeValue);

  saveQuestion("Products question with custom column", {
    idAlias,
    shouldSaveAsNewQuestion: cardType === "question",
  });
};

const createNestedQuestion = ({
  nestedQuestionIdAlias = "nestedQuestionId",
  dashboardIdAlias = "idOfDashboardWithNestedQuestion",
  dashcardIdAlias = "nestedQuestionDashcardId",
}: {
  nestedQuestionIdAlias?: string;
  dashboardIdAlias?: string;
  dashcardIdAlias?: string;
} = {}) => {
  cy.log("Create a nested question and put it in a dashboard");

  cy.get("@savedQuestionId").then(savedQuestionId => {
    createCard({
      columnType: "regular",
      idAlias: nestedQuestionIdAlias,
      sourceTable: `card__${savedQuestionId}`,
      dashboardName: "Dashboard with nested question",
      dashboardIdAlias,
      dashcardIdAlias,
    });
  });
};

const createAdhocQuestion = ({
  customColumnType,
}: {
  customColumnType?: CustomColumnType;
}) => {
  startNewQuestion();
  entityPickerModal().within(() => {
    entityPickerModalTab("Tables").click();
    cy.findByText("Products", { timeout: 10000 }).click();
  });
  if (customColumnType) {
    addCustomColumnToQuestion(customColumnType);
  }
  cy.button("Visualize").click();
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

export const signInAsSandboxedUser = () => {
  cy.log(`Sign in as user via an API call: ${sandboxingUser.email}`);
  cy.request("POST", "/api/session", {
    username: sandboxingUser.email,
    password: sandboxingUser.password,
  });
};

export const renderedResultsShouldBeUnfiltered = () => {
  cy.findAllByText("Gizmo").should("exist");
  cy.findAllByText("Widget").should("exist");
};

export const renderedResultsShouldBeFiltered = () => {
  cy.findAllByText("Gizmo").should("exist");
  cy.findAllByText("Widget").should("not.exist");
};

const editFirstUser = () => {
  cy.log("Add login attribute");
  cy.visit("/admin/people");
  cy.icon("ellipsis").first().click();
  popover().findByText("Edit user").click();
  modal()
    .button(/Add an attribute/)
    .click();
};

const getUserAttribute = (
  columnType: SandboxPolicy["columnType"],
  customColumnType?: SandboxPolicy["customColumnType"],
) => {
  return match([columnType, customColumnType])
    .with(["regular", P._], () => ({
      attributeKey: "can see category",
      attributeValue: "Gizmo",
    }))
    .with(["custom", "boolean"], () => ({
      attributeKey: "is_gizmo",
      attributeValue: "true",
    }))
    .with(["custom", "string"], () => ({
      attributeKey: "can see products where",
      attributeValue: "Category is Gizmo",
    }))
    .with(["custom", "number"], () => ({
      attributeKey: "can see gizmos",
      attributeValue: "1",
    }))
    .otherwise(() => {
      throw new TypeError(
        `Unexpected: columnType is ${columnType} customColumnType is ${customColumnType}`,
      );
    });
};

export const configureUser = ({
  columnType,
  customColumnType,
}: SandboxPolicy) => {
  cy.signInAsAdmin();
  const { attributeKey, attributeValue } = getUserAttribute(
    columnType,
    customColumnType,
  );
  assignAttributeToUser({ attributeKey, attributeValue });
  return { attributeKey };
};

const assignAttributeToUser = ({
  attributeKey,
  attributeValue,
}: {
  attributeKey: string;
  attributeValue: string;
}) => {
  editFirstUser();
  cy.findByPlaceholderText("Key").type(attributeKey);
  cy.findByPlaceholderText("Value").type(attributeValue);
  cy.button("Update").click();
  modal().should("not.exist");
  cy.findByTestId("admin-people-list-table").should("exist");
};

export const configureSandboxPolicy = (
  policy: Pick<SandboxPolicy, "columnType" | "filterTableBy"> & {
    attributeKey?: string;
  },
) => {
  cy.signInAsAdmin();
  const { filterTableBy, columnType, attributeKey } = policy;
  cy.log(`Configure sandboxing policy: ${JSON.stringify(policy)}`);
  cy.log("Show the permissions configuration for the Sample Database");
  cy.visit("/admin/permissions/data/database/1");
  cy.log(
    "Show the permissions configuration for the Sample Database's Products table",
  );
  cy.findByRole("menuitem", { name: /Products/ }).click();
  cy.log("Modify the sandboxing policy for the 'data' group");
  modifyPermission("data", 0, "Sandboxed");

  modal().within(() => {
    cy.findByText(/Change access to this database to .*Sandboxed.*?/);
    cy.button("Change").click();
  });

  modal().findByText(/Restrict access to this table/);
  if (columnType === "regular" && filterTableBy !== "custom_view") {
    cy.log("Filter by a column in the table");
    cy.findByRole("radio", {
      name: /Filter by a column in the table/,
    }).should("be.checked");
  } else if (columnType === "custom" || filterTableBy === "custom_view") {
    cy.findByText(
      /Use a saved question to create a custom view for this table/,
    ).click();
    cy.findByTestId("custom-view-picker-button").click();
    entityPickerModal()
      .findAllByText(/Products.*custom/)
      .first()
      .click();
  } else {
    throw new Error("Unexpected columnType");
  }

  if (filterTableBy === "column" || columnType === "custom") {
    expect(attributeKey).to.be.a("string");
    modal()
      .findByRole("button", { name: /Pick a column|parameter/ })
      .click();
    const columnName =
      columnType === "regular" ? "Category" : "Custom category column";
    cy.findByRole("option", { name: columnName }).click();
    modal()
      .findByRole("button", { name: /Pick a user attribute/ })
      .click();
    cy.findByRole("option", { name: attributeKey }).click();
  }

  cy.log("Wait for the whole summary to render");
  cy.findByLabelText(/Summary/).contains("data");

  cy.log("Ensure the summary contains the correct text");
  cy.findByLabelText(/Summary/)
    .invoke("text")
    .should(summary => {
      expect(summary).to.contain("Users in data can view");
      if (attributeKey) {
        expect(summary).to.contain(`field equals ${attributeKey}`);
      }
    });

  cy.log("Save the sandboxing modal");
  modal().findByRole("button", { name: "Save" }).click();

  saveChangesToPermissions();

  cy.log("Wait for the sandboxing policy to take effect");
  cy.wait(3000);
};

type RegularColumnBasedSandboxPolicy = {
  filterTableBy: "column";
  columnType: "regular";
  customColumnType?: never;
};

type CustomViewBasedSandboxPolicy = {
  filterTableBy: "custom_view";
  columnType: ColumnType;
  customViewType: CustomViewType;
  customColumnType?: CustomColumnType;
};

export type SandboxPolicy =
  | RegularColumnBasedSandboxPolicy
  | CustomViewBasedSandboxPolicy;

const createCustomView = (customViewType: CustomViewType) => {
  cy.log(
    "Create a saved question that we'll use as a custom view when configuring the sandboxing policy",
  );
  createSavedQuestion({
    idAlias: "unfilteredCustomViewId",
    columnType: "custom",
    customColumnType: "string",
    type: customViewType === "model" ? "model" : "question",
  });
  cy.then(function () {
    cy.log(`Custom view created with id: ${this.unfilteredCustomViewId}`);
    visitQuestion(this.unfilteredCustomViewId);
    filter();

    modal().within(() => {
      cy.findByText("Gizmo").click();
      cy.findByTestId("apply-filters").click();
    });

    cy.findAllByText("Category is Gizmo");

    cy.log("Save custom view");

    saveQuestion("Products question custom view", {
      idAlias: "customViewId",
      shouldSaveAsNewQuestion: true,
    });
  });
};

/** Create a variety of cards to test a sandboxing policy: a question, model,
 * saved question, etc. */
export const createCardsShowingGizmosAndWidgets = ({
  filterTableBy,
  columnType,
  customColumnType,
  customViewType,
}: SandboxPolicy) => {
  createSavedQuestion({
    columnType,
    customColumnType,
    dashcardIdAlias: "savedQuestionDashcardId",
  });

  if (filterTableBy === "custom_view") {
    createCustomView(customViewType);
  }

  createModel({
    columnType,
    customColumnType,
    type: "model",
  });

  createNestedQuestion();

  createAdhocQuestion({ customColumnType });
};

/** The endpoint should include results containing Gizmos and Widgets */
export const rowsShouldIncludeGizmosAndWidgets = (
  cardDescription: string,
  endpoint: string,
  payload?: any,
) => {
  payload ??= {
    collection_preview: false,
    ignore_cache: false,
    parameters: [],
  };
  cy.log(`Check that ${cardDescription} is unfiltered`);
  cy.request("POST", endpoint, payload).then(({ body }) => {
    const { data } = body;
    expect(data.is_sandboxed).to.equal(false);
    const expectedCategories = ["Gizmo", "Widget"];

    const actualCategories = data.rows.map((row: any[]) => row[3]);

    expectedCategories.forEach(expectedCategory => {
      expect(
        actualCategories.some((val: string) => val === expectedCategory),
      ).to.equal(true, `Expected category: ${expectedCategory}`);
    });
  });
};

export const rowsShouldOnlyIncludeGizmos = (
  cardDescription: string,
  endpoint: string,
  payload?: any,
) => {
  payload ??= {
    collection_preview: false,
    ignore_cache: false,
    parameters: [],
  };
  cy.log(
    `Check that rows in ${cardDescription} are filtered, with some hidden according to the sandboxing policy`,
  );
  cy.request("POST", endpoint, payload).then(({ body }) => {
    const { data } = body;
    expect(data.is_sandboxed).to.equal(true);
    const actualCategories = data.rows.map((row: any[]) => row[3]);
    expect(actualCategories.every((val: string) => val === "Gizmo")).to.equal(
      true,
      "User should only see Gizmos",
    );
  });
};

function isNumber(value: unknown): asserts value is number {
  expect(value).to.be.a("number");
  if (typeof value !== "number") {
    throw new Error(`Expected a number, but got ${value}`);
  }
}

const getEntityPaths = (aliases: Record<string, number | string>) => {
  const savedQuestionPath = `/api/card/${aliases.savedQuestionId}/query`;
  const nestedQuestionPath = `/api/card/${aliases.nestedQuestionId}/query`;
  const savedQuestionInDashboardPath = `/api/dashboard/${aliases.idOfDashboardWithSavedQuestion}/dashcard/${aliases.savedQuestionDashcardId}/card/${aliases.savedQuestionId}/query`;
  const nestedQuestionInDashboardPath = `/api/dashboard/${aliases.idOfDashboardWithNestedQuestion}/dashcard/${aliases.nestedQuestionDashcardId}/card/${aliases.nestedQuestionId}/query`;
  const modelPayload = {
    database: SAMPLE_DB_ID,
    parameters: [],
    query: { source_table: `card__${aliases.modelId}` },
    type: "query",
  };
  return {
    savedQuestionPath,
    nestedQuestionPath,
    savedQuestionInDashboardPath,
    nestedQuestionInDashboardPath,
    modelPayload,
  };
};

export const cardsShouldShowGizmosAndWidgets = ({
  customColumnType,
}: Pick<SandboxPolicy, "customColumnType">) => {
  cy.then(function () {
    const {
      savedQuestionPath,
      nestedQuestionPath,
      savedQuestionInDashboardPath,
      nestedQuestionInDashboardPath,
      modelPayload,
    } = getEntityPaths(this);

    cy.log(
      "Ensure that the entities we will be testing are at first unfiltered, so that we can see how the sandboxing policy affects them",
    );
    rowsShouldIncludeGizmosAndWidgets("Saved question", savedQuestionPath);
    rowsShouldIncludeGizmosAndWidgets("Nested question", nestedQuestionPath);
    rowsShouldIncludeGizmosAndWidgets(
      "Saved question in dashboard",
      savedQuestionInDashboardPath,
    );
    rowsShouldIncludeGizmosAndWidgets(
      "Nested question in dashboard",
      nestedQuestionInDashboardPath,
    );
    rowsShouldIncludeGizmosAndWidgets("Model", "/api/dataset", modelPayload);
    adhocQuestionShouldBeUnfiltered(customColumnType);
  });
};

export const cardsShouldOnlyShowGizmos = ({
  customColumnType,
}: Pick<SandboxPolicy, "customColumnType">) => {
  cy.then(function () {
    const {
      savedQuestionPath,
      nestedQuestionPath,
      savedQuestionInDashboardPath,
      nestedQuestionInDashboardPath,
      modelPayload,
    } = getEntityPaths(this);
    rowsShouldOnlyIncludeGizmos("Saved question", savedQuestionPath);
    rowsShouldOnlyIncludeGizmos("Nested question", nestedQuestionPath);
    rowsShouldOnlyIncludeGizmos(
      "Saved question in dashboard",
      savedQuestionInDashboardPath,
    );
    rowsShouldOnlyIncludeGizmos(
      "Nested question in dashboard",
      nestedQuestionInDashboardPath,
    );
    rowsShouldOnlyIncludeGizmos("Model", "/api/dataset", modelPayload);
    adhocQuestionShouldBeFiltered(customColumnType);
  });
};

const cardShouldThrowError = (
  cardDescription: string,
  endpoint: string,
  payload?: any,
) => {
  payload ??= {
    collection_preview: false,
    ignore_cache: false,
    parameters: [],
  };
  cy.log(`Check that ${cardDescription} fails closed, revealing no data`);
  cy.request("POST", endpoint, payload).then(response => {
    expect(response.body.data.rows).to.have.length(0);
    expect(response.body.data.cols).to.have.length(0);
    expect(response.status).to.equal(202);
    expect(response.body.via[0].status).to.equal("failed");
  });
};

/** Assert that the cards we're testing all fail and do not show any data */
export const cardsShouldThrowErrors = ({
  customColumnType,
}: Pick<SandboxPolicy, "customColumnType">) => {
  cy.then(function () {
    const {
      savedQuestionPath,
      nestedQuestionPath,
      savedQuestionInDashboardPath,
      nestedQuestionInDashboardPath,
      modelPayload,
    } = getEntityPaths(this);
    cardShouldThrowError("Saved question", savedQuestionPath);
    cardShouldThrowError("Nested question", nestedQuestionPath);
    cardShouldThrowError(
      "Saved question in dashboard",
      savedQuestionInDashboardPath,
    );
    cardShouldThrowError(
      "Nested question in dashboard",
      nestedQuestionInDashboardPath,
    );
    cardShouldThrowError("Model", "/api/dataset", modelPayload);
    adhocQuestionShouldThrowError(customColumnType);
  });
};

const adhocQuestionShouldBeFiltered = (customColumnType?: CustomColumnType) => {
  createAdhocQuestion({ customColumnType });
  renderedResultsShouldBeFiltered();
};

const adhocQuestionShouldThrowError = (customColumnType?: CustomColumnType) => {
  cy.intercept("POST", "/api/dataset").as("dataset");
  createAdhocQuestion({ customColumnType });
  cy.findAllByText("Gizmos").should("not.exist");
  cy.findAllByText("Widgets").should("not.exist");
  cy.findByText(/There was a problem with your question/i).should("be.visible");
  cy.wait("@dataset").then(({ response }) => {
    expect(response?.statusCode).to.equal(202);
    expect(response?.body.via[0].status).to.equal("failed");
    expect(response?.body.data.rows).to.have.length(0);
    expect(response?.body.data.cols).to.have.length(0);
  });
};

const adhocQuestionShouldBeUnfiltered = (
  customColumnType?: CustomColumnType,
) => {
  createAdhocQuestion({ customColumnType });
  renderedResultsShouldBeUnfiltered();
};
