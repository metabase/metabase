import {
  type DatabaseId,
  WRITABLE_DB_CONFIG,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";

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
    getWritableConnectionInfoSection()
      .findByText("Connected")
      .should("be.visible");

    updateWritableConnection(READ_ONLY_USER);
    getWritableConnectionInfoSection()
      .findByText("Connected")
      .should("be.visible");

    removeWritableConnection();
    getWritableConnectionInfoSection()
      .findByText("Connected")
      .should("not.exist");
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
});

function createTransform() {
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
