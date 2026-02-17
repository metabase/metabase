import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const DATABASE_NAME = "sample";
const OWNER_USER_NAME = "metabase";
const OWNER_USER_PASSWORD = "metasample123";
const READ_ONLY_USER_NAME = "readonly_user";
const READ_ONLY_USER_PASSWORD = "readonly_user";

const CREATE_USER_QUERY = `                                                                                              
  CREATE USER ${READ_ONLY_USER_NAME} WITH PASSWORD '${READ_ONLY_USER_PASSWORD}';     
`;

const GRANT_PRIVILEGES_QUERY = `
  GRANT CONNECT ON DATABASE ${DATABASE_NAME} TO ${READ_ONLY_USER_NAME};
  GRANT USAGE ON SCHEMA public TO ${READ_ONLY_USER_NAME};
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READ_ONLY_USER_NAME};
`;

const REVOKE_PRIVILEGES_QUERY = `
  DROP OWNED BY ${READ_ONLY_USER_NAME};
`;

const DROP_USER_QUERY = `
  DROP USER IF EXISTS ${READ_ONLY_USER_NAME};
`;

describe("scenarios > data studio > transforms > writable connection", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    dropReadOnlyUser();
    createReadOnlyUser();
    grantPrivilegesToReadOnlyUser();
  });

  afterEach(() => {
    revokePrivilegesFromReadOnlyUser();
    dropReadOnlyUser();
  });

  it("should be able to create, update and remove a writable connection", () => {
    makeMainConnectionReadOnly();

    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    createTransform().then(({ body: transform }) => {
      createWritableConnection();
      checkWritableConnectionHealthInfo();
      H.runTransformAndWaitForSuccess(transform.id);

      updateWritableConnectionUserAndPassword(
        READ_ONLY_USER_NAME,
        READ_ONLY_USER_PASSWORD,
      );
      checkWritableConnectionHealthInfo();
      H.runTransformAndWaitForFailure(transform.id);

      updateWritableConnectionUserAndPassword(
        OWNER_USER_NAME,
        OWNER_USER_PASSWORD,
      );
      checkWritableConnectionHealthInfo();
      H.runTransformAndWaitForSuccess(transform.id);

      removeWritableConnection();
      H.runTransformAndWaitForFailure(transform.id);
    });
  });
});

function createReadOnlyUser() {
  H.queryWritableDB(CREATE_USER_QUERY);
}

function grantPrivilegesToReadOnlyUser() {
  H.queryWritableDB(GRANT_PRIVILEGES_QUERY);
}

function revokePrivilegesFromReadOnlyUser() {
  H.queryWritableDB(REVOKE_PRIVILEGES_QUERY);
}

function dropReadOnlyUser() {
  H.queryWritableDB(DROP_USER_QUERY);
}

function makeMainConnectionReadOnly() {
  cy.request("GET", `/api/database/${WRITABLE_DB_ID}`).then(({ body }) => {
    const { details } = body;
    cy.request("PUT", `/api/database/${WRITABLE_DB_ID}`, {
      details: {
        ...details,
        user: READ_ONLY_USER_NAME,
        password: READ_ONLY_USER_PASSWORD,
      },
    });
  });
}

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

function getWritableConnectionInfoSection() {
  return cy.findByTestId("writable-connection-info-section");
}

function getWritableConnectionInfoPage() {
  return cy.findByTestId("writable-connection-info-page");
}

function checkWritableConnectionHealthInfo() {
  getWritableConnectionInfoSection()
    .findByText("Connected")
    .should("be.visible");
}

function createWritableConnection() {
  getWritableConnectionInfoSection().findByText("Add writable connection").click();
  getWritableConnectionInfoPage().within(() => {
    cy.findByLabelText("Password").type(OWNER_USER_PASSWORD);
    cy.button("Save").click();
  });
  getWritableConnectionInfoSection().should("be.visible");
}

function updateWritableConnectionUserAndPassword(
  username: string,
  password: string,
) {
  getWritableConnectionInfoSection().findByText("Edit connection details").click();
  getWritableConnectionInfoPage().within(() => {
    cy.findByLabelText("Username").type(username);
    cy.findByLabelText("Password").type(password);
    cy.button("Save changes").click();
  });
  getWritableConnectionInfoSection().should("be.visible");
}

function removeWritableConnection() {
  getWritableConnectionInfoSection()
    .button("Remove writable connection")
    .click();
  H.modal().button("Remove").click();
  getWritableConnectionInfoSection()
    .button("Add writable connection")
    .should("be.visible");
}
