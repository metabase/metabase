import { WRITABLE_DB_CONFIG, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { DatabaseId, TableId, TransformTagId } from "metabase-types/api";

const { H } = cy;

type DatabaseCredentials = {
  username: string;
  password: string;
};

const DEFAULT_USER: DatabaseCredentials = {
  username: WRITABLE_DB_CONFIG.mysql.connection.user,
  password: WRITABLE_DB_CONFIG.mysql.connection.password,
};

const READ_ONLY_USER: DatabaseCredentials = {
  username: "readonly_user",
  password: "readonly_user",
};

const DATABASE_NAME = WRITABLE_DB_CONFIG.mysql.connection.database;
const TRANSFORM_TABLE_NAME = "transform_table";

describe("scenarios > admin > databases > writable connection", () => {
  beforeEach(() => {
    H.restore("mysql-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    createUser(READ_ONLY_USER);
  });

  afterEach(() => {
    dropUser(READ_ONLY_USER);
    dropTable(TRANSFORM_TABLE_NAME);
  });

  it("should be able to create, edit, and remove a writable connection", () => {
    visitDatabase(WRITABLE_DB_ID);
    createWritableConnection(DEFAULT_USER);
    updateWritableConnection(READ_ONLY_USER);
    removeWritableConnection();
    getWritableConnectionInfoSection()
      .findByText("Add writable connection")
      .should("exist");
  });

  it("should validate writable connection details on save", () => {
    visitDatabase(WRITABLE_DB_ID);
    getWritableConnectionInfoSection()
      .findByText("Add writable connection")
      .click();
    fillInCredentials({
      username: "invalid",
      password: "invalid",
    });

    cy.button("Save").click();
    cy.findByRole("alert").should(
      "contain.text",
      "Metabase tried, but couldn't connect",
    );
  });

  it("should show up-to-date connection health status", () => {
    visitDatabase(WRITABLE_DB_ID);
    createWritableConnection(READ_ONLY_USER);
    getMainConnectionInfoSection().within(() => {
      getDatabaseConnectionHealthInfo().should("have.text", "Connected");
    });
    getWritableConnectionInfoSection().within(() => {
      getDatabaseConnectionHealthInfo().should("have.text", "Connected");
    });

    dropUser(READ_ONLY_USER);
    visitDatabase(WRITABLE_DB_ID);
    getMainConnectionInfoSection().within(() => {
      getDatabaseConnectionHealthInfo().should("have.text", "Connected");
    });
    getWritableConnectionInfoSection().within(() => {
      getDatabaseConnectionHealthInfo().should(
        "contain.text",
        "Could not connect",
      );
    });
  });

  it("should be able to run transforms with a writable connection", () => {
    visitDatabase(WRITABLE_DB_ID);

    createTransform().then(({ body: transform }) => {
      updateMainConnection(READ_ONLY_USER);
      H.runTransformAndWaitForFailure(transform.id);

      createWritableConnection(DEFAULT_USER);
      H.runTransformAndWaitForSuccess(transform.id);
    });
  });

  it("should be able to run transforms via a job with a writable connection", () => {
    visitDatabase(WRITABLE_DB_ID);
    updateMainConnection(READ_ONLY_USER);
    createWritableConnection(DEFAULT_USER);

    H.createTransformTag({ name: "New tag" }).then(({ body: tag }) => {
      createTransform({ tagIds: [tag.id] });
      H.createTransformJob({
        schedule: "* * * * * ? *", // every second
        tag_ids: [tag.id],
      });
    });
    H.waitForSucceededTransformRuns();
  });

  it("should be able to use model actions with a writable connection", () => {
    visitDatabase(WRITABLE_DB_ID);

    cy.log("Model actions should be enabled for this db");
    cy.findByLabelText("Model actions").should("be.checked");

    createModelWithAction().then((action) => {
      updateMainConnection(READ_ONLY_USER);
      runAction(action.id).then(expectFailure);

      createWritableConnection(DEFAULT_USER);
      runAction(action.id).then(expectSuccess);
    });
  });

  it("should be able to use table editing with a writable connection", () => {
    visitDatabase(WRITABLE_DB_ID);
    enableTableEditing();

    H.getTableId({ databaseId: WRITABLE_DB_ID, name: "ORDERS" }).then(
      (ordersId) => {
        updateMainConnection(READ_ONLY_USER);
        performTableEdit(ordersId).then(expectFailure);

        createWritableConnection(DEFAULT_USER);
        performTableEdit(ordersId).then(expectSuccess);
      },
    );
  });
});

function createTransform({ tagIds = [] }: { tagIds?: TransformTagId[] } = {}) {
  return H.createTransform({
    name: "Test transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: "SELECT 1 as num",
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: TRANSFORM_TABLE_NAME,
      schema: null,
    },
    tag_ids: tagIds,
  });
}

function queryDB(query: string) {
  H.queryWritableDB(query, "mysql");
}

function createUser(credentials: DatabaseCredentials) {
  queryDB(
    `CREATE USER IF NOT EXISTS ${credentials.username} IDENTIFIED BY '${credentials.password}';
     GRANT SELECT ON ${DATABASE_NAME}.* TO '${credentials.username}';  `,
  );
}

function dropUser(credentials: DatabaseCredentials) {
  queryDB(`DROP USER IF EXISTS '${credentials.username}';`);
}

function dropTable(tableName: string) {
  queryDB(`DROP TABLE IF EXISTS ${tableName};`);
}

function visitDatabase(databaseId: DatabaseId) {
  cy.visit(`/admin/databases/${databaseId}`);
}

function getMainConnectionInfoSection() {
  return cy.findByTestId("database-connection-info-section");
}

function getWritableConnectionInfoSection() {
  return cy.findByTestId("writable-connection-info-section");
}

function getDatabaseConnectionHealthInfo() {
  return cy.findByTestId("database-connection-health-info");
}

function fillInCredentials(credentials: DatabaseCredentials) {
  cy.findByLabelText("Username").clear().type(credentials.username);
  cy.findByLabelText("Password").clear().type(credentials.password);
}

function createWritableConnection(credentials: DatabaseCredentials) {
  getWritableConnectionInfoSection()
    .findByText("Add writable connection")
    .click();
  fillInCredentials(credentials);
  cy.button("Save").click();
  getWritableConnectionInfoSection().should("be.visible");
}

function updateMainConnection(credentials: DatabaseCredentials) {
  getMainConnectionInfoSection().findByText("Edit connection details").click();
  fillInCredentials(credentials);
  cy.button("Save changes").click();
  getMainConnectionInfoSection().should("be.visible");
}

function updateWritableConnection(credentials: DatabaseCredentials) {
  getWritableConnectionInfoSection()
    .findByText("Edit connection details")
    .click();
  fillInCredentials(credentials);
  cy.button("Save changes").click();
  getWritableConnectionInfoSection().should("be.visible");
}

function removeWritableConnection() {
  getWritableConnectionInfoSection()
    .button("Remove writable connection")
    .click();
  H.modal().button("Remove").click();
  getWritableConnectionInfoSection().should("be.visible");
}

function createModelWithAction() {
  return H.createTestNativeQuery({
    database: WRITABLE_DB_ID,
    query: "SELECT * FROM sample.ORDERS",
  })
    .then((dataset_query) =>
      H.createCard({
        name: "Test model",
        type: "model",
        dataset_query,
      }),
    )
    .then((model) =>
      H.createAction({
        type: "query",
        name: "Delete order",
        database_id: WRITABLE_DB_ID,
        model_id: model.id,
        parameters: [],
        dataset_query: {
          database: WRITABLE_DB_ID,
          type: "native",
          native: {
            query: "DELETE FROM sample.ORDERS WHERE id = 1",
          },
        },
      }),
    )
    .then(({ body: action }) => action);
}

function runAction(actionId: number) {
  return cy.request({
    failOnStatusCode: false,
    method: "POST",
    url: `/api/action/${actionId}/execute`,
    body: JSON.stringify({
      parameters: {},
    }),
  });
}

function expectFailure(response: Cypress.Response<unknown>) {
  expect(response.status).to.be.gte(400);
}

function expectSuccess(response: Cypress.Response<unknown>) {
  expect(response.status).to.be.lt(400);
}

function enableTableEditing() {
  cy.findByLabelText("Editable tables").scrollIntoView().click();
}

function performTableEdit(tableId: TableId) {
  return cy.request({
    failOnStatusCode: false,
    method: "POST",
    url: "/api/ee/action-v2/execute-bulk",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "data-grid.row/create",
      scope: { "table-id": tableId },
      inputs: [{ ID: 42 }],
    }),
  });
}
