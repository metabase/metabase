import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";

const TIMEOUT_MS = 40000;

const CLIENT_PORT = Cypress.env("CLIENT_PORT");
const CLIENT_HOST = `http://localhost:${CLIENT_PORT}`;

describe("Embedding SDK: shared Host Apps compatibility tests", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    mockAuthProviderAndJwtSignIn();
  });

  it("should download an Interactive Dashboard", () => {
    cy.deleteDownloadsFolder();

    cy.visit({
      url: `${CLIENT_HOST}/interactive-dashboard`,
    });

    sdkRoot().should("exist");
    sdkRoot().within(() => {
      cy.findByTestId("fixed-width-dashboard-header", {
        timeout: TIMEOUT_MS,
      }).within(() => {
        cy.findByTestId("export-as-pdf-button").click();
      });

      cy.verifyDownload(".pdf", {
        timeout: TIMEOUT_MS,
        contains: true,
      });
    });
  });

  it("should load a metabase locale", () => {
    cy.visit({
      url: `${CLIENT_HOST}/interactive-question?locale=es&questionId=1`,
    });

    cy.findByTestId("interactive-question-result-toolbar", {
      timeout: TIMEOUT_MS,
    }).within(() => {
      expect(cy.findByText("Tabla").should("exist"));
    });
  });

  it("should load a dayjs locale in date picker", () => {
    const time = new Date("2025-01-01");
    cy.clock(time, ["Date"]);

    cy.visit({
      url: `${CLIENT_HOST}/interactive-question?locale=es&questionId=1`,
    });

    cy.findByTestId("interactive-question-result-toolbar", {
      timeout: TIMEOUT_MS,
    }).within(() => {
      cy.findByText("Filtro").click();
    });

    cy.get('[data-element-id="mantine-popover"]').within(() => {
      cy.findByText("Started At").click();
      cy.findByText(/Rango de fechas relativo…/).click();
    });

    cy.findByTestId("date-filter-picker").within(() => {
      cy.findByText(/^dic.*2024/).should("exist");
    });
  });

  it("should load a dayjs locale", () => {
    const time = new Date("2025-01-01");
    cy.clock(time, ["Date"]);

    cy.visit({
      url: `${CLIENT_HOST}/interactive-question?locale=es&questionId=1`,
    });

    cy.findByTestId("interactive-question-result-toolbar", {
      timeout: TIMEOUT_MS,
    }).within(() => {
      cy.findByText("Filtro").click();
    });
    cy.get('[data-element-id="mantine-popover"]').within(() => {
      cy.findByText("Started At").click();
      cy.findByText(/Rango de fechas fijo…/).click();
    });

    cy.findByTestId("date-filter-picker").within(() => {
      cy.findByText("enero 2025").should("exist");
    });
  });
});

function sdkRoot() {
  return cy.get(".mb-wrapper").first();
}
