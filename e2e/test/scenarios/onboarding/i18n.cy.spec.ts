import { NORMAL_USER_ID } from "e2e/support/cypress_sample_instance_data";
import type { LocaleData } from "metabase-types/api";

const { H } = cy;

const paths = [
  "/",
  "/getting-started",
  "/collection/root",
  "/browse/models",
  "/browse/databases",
  "/browse/metrics",
  "/trash",
  "/admin",
];

const locales = [
  "Chinese (China)",
  "Chinese (Taiwan)",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Korean",
  "Portuguese (Brazil)",
  "Russian",
  "Spanish",
];

describe("Pages accessible within one click from the homepage should work in popular locales", () => {
  before(H.restore);

  beforeEach(() => {
    cy.signInAsNormalUser();
  });

  it("should be able to open the app with every locale from the available locales (metabase#22192)", () => {
    cy.intercept("GET", "/api/user/current").as("getUser");
    cy.request<{ "available-locales": LocaleData[] }>(
      "GET",
      "/api/session/properties",
    ).then(({ body: settings }) => {
      settings["available-locales"].forEach(([locale]) => {
        cy.log(`Using ${locale} locale`);
        cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale });
        cy.visit("/");
        cy.wait("@getUser");
        H.getProfileLink().should("exist");
      });
    });
  });

  locales.forEach((localeName) => {
    it(`Pages should be reachable when locale is ${localeName}`, () => {
      selectLocale(localeName);
      paths.forEach((path) => {
        cy.visit(path);
        if (path === "/admin") {
          cy.location("pathname").should("eq", "/unauthorized");
          H.main().icon("key").should("be.visible");
          H.main().findByRole("status").should("be.visible");
        } else {
          cy.location("pathname").should("eq", path);
          cy.findByRole("main").should("be.visible");
          assertPageContent(path);
        }
        cy.findAllByTestId("error-boundary").should("not.exist");
      });
    });
  });
});

const selectLocale = (localeName: string) => {
  cy.request<{ "available-locales": LocaleData[] }>(
    "GET",
    "/api/session/properties",
  ).then(({ body: settings }) => {
    const locale = settings["available-locales"].find(
      ([, name]) => name === localeName,
    )?.[0];
    expect(locale, localeName).to.be.a("string");
    cy.request("PUT", `/api/user/${NORMAL_USER_ID}`, { locale });
  });
};

function assertPageContent(path: string) {
  switch (path) {
    case "/":
      cy.findByTestId("greeting-message").should("be.visible");
      break;
    case "/getting-started":
      cy.findByTestId("dashboard-item").should("be.visible");
      break;
    case "/collection/root":
      H.collectionTable().should("contain", "Orders");
      break;
    case "/browse/models":
      cy.findByRole("heading", { name: "Orders Model" }).should("be.visible");
      break;
    case "/browse/databases":
      cy.findByTestId("database-browser").should("contain", "Sample Database");
      break;
    case "/browse/metrics":
      H.main().findAllByRole("status").should("be.visible");
      break;
    case "/trash":
      cy.findByTestId("collection-name-heading").should("be.visible");
      break;
  }
}
