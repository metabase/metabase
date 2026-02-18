import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const OWNER_USER_NAME = "metabase";
const OWNER_USER_PASSWORD = "metasample123";
const READ_ONLY_USER_NAME = "readonly_user";
const READ_ONLY_USER_PASSWORD = "readonly_user";

describe("scenarios > data studio > transforms > writable connection", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should be able to create, update and remove a writable connection", () => {
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
  getWritableConnectionInfoSection()
    .findByText("Add writable connection")
    .click();
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
  getWritableConnectionInfoSection()
    .findByText("Edit connection details")
    .click();
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
