import {
  setUpDataAppDevServer,
  tearDownDataAppDevServer,
} from "e2e/support/helpers/e2e-data-app-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";

const TIMEOUT_MS = 40000;

const CLIENT_PORT = Cypress.expose("CLIENT_PORT");
const CLIENT_HOST = `http://localhost:${CLIENT_PORT}`;

describe("Embedding SDK: data-app dev server", () => {
  before(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    setUpDataAppDevServer(CLIENT_HOST);
  });

  after(() => {
    tearDownDataAppDevServer();
  });

  it("serves and renders the sandboxed data app", () => {
    cy.visit(CLIENT_HOST);

    cy.findByTestId("dev-app-content", { timeout: TIMEOUT_MS }).should("exist");
    cy.findByTestId("dev-app-question").should("exist");
  });

  it("renders a StaticQuestion fed a query from useMetabaseQueryObject", () => {
    cy.visit(CLIENT_HOST);

    cy.findByTestId("table-body", { timeout: TIMEOUT_MS })
      .findAllByTestId("cell-data")
      .should("have.length.greaterThan", 0);
  });
});
