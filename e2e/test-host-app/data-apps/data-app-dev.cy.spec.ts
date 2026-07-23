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

    // Assert a rendered cell value, so the query actually resolved and ran.
    cy.findAllByTestId("header-cell", { timeout: TIMEOUT_MS }).then(
      ($headers) => {
        const subtotalIndex = [...$headers].findIndex(
          (header) => header.textContent?.trim() === "Subtotal",
        );
        expect(subtotalIndex, "Subtotal column").to.be.at.least(0);

        cy.findByTestId("table-body")
          .findAllByTestId("cell-data")
          .should("have.length.greaterThan", subtotalIndex)
          .then(($cells) => {
            const subtotal = $cells.eq(subtotalIndex).text();
            expect(parseFloat(subtotal.replace(/[^\d.]/g, ""))).to.be.above(0);
          });
      },
    );
  });
});
