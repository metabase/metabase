import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";

const TIMEOUT_MS = 40000;

const CLIENT_PORT = Cypress.expose("CLIENT_PORT");
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
      url: `${CLIENT_HOST}/interactive-question?locale=en-ZZ&questionId=1`,
    });

    cy.findByTestId("interactive-question-result-toolbar", {
      timeout: TIMEOUT_MS,
    }).within(() => {
      expect(cy.findByText("[zz] Table").should("exist"));
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
      cy.findByTestId("filter-dropdown-button").click();
    });

    cy.get('[data-element-id="mantine-popover"]')
      .should("have.length.above", 0)
      .last()
      .within(() => {
        // "Started At" is the column display name from the database, stable across locales.
        cy.findByText("Started At").click();
        cy.findByTestId("date-picker-type-relative").click();
      });

    cy.findByTestId("date-filter-picker").within(() => {
      // Dayjs Spanish month abbreviation — this is the actual thing under test.
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
      cy.findByTestId("filter-dropdown-button").click();
    });
    cy.get('[data-element-id="mantine-popover"]')
      .should("have.length.above", 0)
      .last()
      .within(() => {
        // "Started At" is the column display name from the database, stable across locales.
        cy.findByText("Started At").click();
        cy.findByTestId("date-picker-type-specific").click();
      });

    cy.findByTestId("date-filter-picker").within(() => {
      // Dayjs Spanish month name — this is the actual thing under test.
      cy.findByText("enero 2025").should("exist");
    });
  });
});

function sdkRoot() {
  return cy.get(".mb-wrapper").first();
}
