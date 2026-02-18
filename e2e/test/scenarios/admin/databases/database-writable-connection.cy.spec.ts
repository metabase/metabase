import { WRITABLE_DB_CONFIG, WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const TRANSFORM_TABLE_NAME = "transform_table";
const DEFAULT_USER_NAME = WRITABLE_DB_CONFIG.mysql.connection.user;
const DEFAULT_USER_PASSWORD = WRITABLE_DB_CONFIG.mysql.connection.password;
const READ_ONLY_USER_NAME = "readonly_user";
const READ_ONLY_USER_PASSWORD = "readonly_user";

describe("scenarios > admin > databases > writable connection", () => {
  beforeEach(() => {
    H.restore("mysql-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    createReadonlyUser();
  });

  afterEach(() => {
    dropReadonlyUser();
    dropTransformTable();
  });

  it("should be able to run transforms with a writable connection", () => {
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    makeMainConnectionReadonly();

    createTransform().then(({ body: transform }) => {
      H.runTransformAndWaitForFailure(transform.id);

      createWritableConnection(DEFAULT_USER_NAME, DEFAULT_USER_PASSWORD);
      H.runTransformAndWaitForSuccess(transform.id);

      makeWritableConnectionReadonly();
      H.runTransformAndWaitForFailure(transform.id);

      makeWritableConnectionWritable();
      H.runTransformAndWaitForSuccess(transform.id);

      removeWritableConnection();
      H.runTransformAndWaitForFailure(transform.id);
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

function queryMysql(query: string) {
  H.queryWritableDB(query, "mysql");
}

function createReadonlyUser() {
  queryMysql(
    `CREATE USER IF NOT EXISTS ${READ_ONLY_USER_NAME} IDENTIFIED BY '${READ_ONLY_USER_PASSWORD}';
     GRANT SELECT ON writable_db.* TO '${READ_ONLY_USER_NAME}';  `,
  );
}

function dropReadonlyUser() {
  queryMysql(`DROP USER IF EXISTS '${READ_ONLY_USER_NAME}';`);
}

function dropTransformTable() {
  queryMysql(`DROP TABLE IF EXISTS ${TRANSFORM_TABLE_NAME};`);
}

function getMainConnectionInfoSection() {
  return cy.findByTestId("database-connection-info-section");
}

function getWritableConnectionInfoSection() {
  return cy.findByTestId("writable-connection-info-section");
}

function fillUserAndPassword(username: string, password: string) {
  cy.findByLabelText("Username").clear().type(username);
  cy.findByLabelText("Password").clear().type(password);
}

function createWritableConnection(username: string, password: string) {
  getWritableConnectionInfoSection()
    .findByText("Add writable connection")
    .click();
  fillUserAndPassword(username, password);
  cy.button("Save").click();
  getWritableConnectionInfoSection().should("be.visible");
}

function makeMainConnectionReadonly() {
  getMainConnectionInfoSection().findByText("Edit connection details").click();
  fillUserAndPassword(READ_ONLY_USER_NAME, READ_ONLY_USER_PASSWORD);
  cy.button("Save changes").click();
  getMainConnectionInfoSection().should("be.visible");
}

function makeWritableConnectionWritable() {
  getWritableConnectionInfoSection()
    .findByText("Edit connection details")
    .click();
  fillUserAndPassword(DEFAULT_USER_NAME, DEFAULT_USER_PASSWORD);
  cy.button("Save changes").click();
  getWritableConnectionInfoSection().should("be.visible");
}

function makeWritableConnectionReadonly() {
  getWritableConnectionInfoSection()
    .findByText("Edit connection details")
    .click();
  fillUserAndPassword(READ_ONLY_USER_NAME, READ_ONLY_USER_PASSWORD);
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
