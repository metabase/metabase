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

  it("sandboxes network requests but permits allowed_hosts", () => {
    cy.intercept("https://allowed.data-app.test/**").as("allowedRequest");
    cy.intercept("https://blocked.data-app.test/**").as("blockedRequest");

    cy.visit(CLIENT_HOST);

    // The allowed host (in data_app.yaml) reaches the network; the other never
    // does — the sandbox rejects it before a request is made.
    cy.get("@allowedRequest.all", { timeout: TIMEOUT_MS }).should(
      "have.length.at.least",
      1,
    );
    cy.get("@blockedRequest.all").should("have.length", 0);
  });
});
