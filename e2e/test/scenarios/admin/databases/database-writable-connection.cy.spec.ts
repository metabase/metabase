import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const DATABASE_NAME = "sample";
const OWNER_USER_NAME = "metabase";
const OWNER_USER_PASSWORD = "metasample123";
const READ_ONLY_USER_NAME = "readonly_user";
const READ_ONLY_USER_PASSWORD = "readonly_user";

describe("scenarios > admin > databases > writable connection", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    createReadonlyUserIfNotExists();
  });

  afterEach(() => {
    dropReadonlyUserIfExists();
  });

  it("should be able to run transforms with a writable connection", () => {
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    updateMainConnectionUserAndPassword(
      READ_ONLY_USER_NAME,
      READ_ONLY_USER_PASSWORD,
    );

    createTransform().then(({ body: transform }) => {
      H.runTransformAndWaitForFailure(transform.id);

      createWritableConnection(OWNER_USER_NAME, OWNER_USER_PASSWORD);
      H.runTransformAndWaitForSuccess(transform.id);

      updateWritableConnectionUserAndPassword(
        READ_ONLY_USER_NAME,
        READ_ONLY_USER_PASSWORD,
      );
      H.runTransformAndWaitForFailure(transform.id);

      updateWritableConnectionUserAndPassword(
        OWNER_USER_NAME,
        OWNER_USER_PASSWORD,
      );
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
      name: "test_transform",
      schema: "public",
    },
  });
}

function checkIfReadonlyUserExists() {
  return H.queryWritableDB(
    `SELECT * FROM pg_roles WHERE rolname = '${READ_ONLY_USER_NAME}'`,
  ).then((result) => {
    return result.rows.length > 0;
  });
}

function createReadonlyUser() {
  H.queryWritableDB(
    `CREATE USER ${READ_ONLY_USER_NAME} WITH PASSWORD '${READ_ONLY_USER_PASSWORD}';
     GRANT CONNECT ON DATABASE ${DATABASE_NAME} TO ${READ_ONLY_USER_NAME};
     GRANT USAGE ON SCHEMA public TO ${READ_ONLY_USER_NAME};
     GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READ_ONLY_USER_NAME};`,
  );
}

function createReadonlyUserIfNotExists() {
  checkIfReadonlyUserExists().then((hasUser) => {
    if (!hasUser) {
      createReadonlyUser();
    }
  });
}

function getMainConnectionInfoSection() {
  return cy.findByTestId("database-connection-info-section");
}

function getWritableConnectionInfoSection() {
  return cy.findByTestId("writable-connection-info-section");
}

function createWritableConnection(username: string, password: string) {
  getWritableConnectionInfoSection()
    .findByText("Add writable connection")
    .click();
  cy.findByLabelText("Username").clear().type(username);
  cy.findByLabelText("Password").clear().type(password);
  cy.button("Save").click();
  getWritableConnectionInfoSection().should("be.visible");
}

function updateMainConnectionUserAndPassword(
  username: string,
  password: string,
) {
  getMainConnectionInfoSection().findByText("Edit connection details").click();
  cy.findByLabelText("Username").clear().type(username);
  cy.findByLabelText("Password").clear().type(password);
  cy.button("Save changes").click();
  getMainConnectionInfoSection().should("be.visible");
}

function updateWritableConnectionUserAndPassword(
  username: string,
  password: string,
) {
  getWritableConnectionInfoSection()
    .findByText("Edit connection details")
    .click();

  cy.findByLabelText("Username").clear().type(username);
  cy.findByLabelText("Password").clear().type(password);
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
