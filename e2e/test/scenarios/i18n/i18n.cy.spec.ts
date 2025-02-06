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
  "Chinese",
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
    cy.intercept("PUT", "/api/user/*").as("updateUserSettings");
  });

  locales.forEach(localeName => {
    it(`Pages should be reachable when locale is ${localeName}`, () => {
      selectLocale(localeName);
      paths.forEach(path => {
        cy.visit(path);
        cy.findByRole("main");
        cy.findAllByTestId("error-boundary").should("not.exist");
      });
    });
  });
});

const selectLocale = (localeName: string) => {
  cy.visit("/account/profile");

  cy.findByTestId("user-locale-select").click();
  H.popover().within(() => cy.findByText(localeName).click());

  cy.get("[type=submit]").click();
  cy.wait("@updateUserSettings");
};
