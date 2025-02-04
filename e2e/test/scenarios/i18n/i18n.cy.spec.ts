const { H } = cy;

const locales = {
  "Portuguese (Brazil)": {
    "/": /Início/,
    "/getting-started": /Comece a visualizar seus dados/,
    "/browse/models": /Descrição/,
    "/browse/metrics": /Crie métricas/,
    "/trash": /Nada aqui/,
  },
  // "Chinese (China)": { "/": "你好，鲍比！" },
  // "Chinese (Taiwan)": { "/": "哈囉，鮑比！" },
  // French: { "/": "Accueil" },
  // German: { "/": "Hallo, Bobby!" },
  // Italian: { "/": "Ciao, Bobby!" },
  // Japanese: { "/": "こんにちは、ボビー！" },
  // Korean: { "/": "안녕, 바비!" },
  // Russian: { "/": "Привет, Бобби!" },
  // Spanish: { "/": "Hola, Bobby!" },
};

describe("Test that high-visibility pages work in popular locales", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/user/*").as("updateUserSettings");
  });

  Object.entries(locales).forEach(([localeName, pathToExpectedString]) => {
    it(`Tour works in ${localeName}`, () => {
      selectLocale(localeName);
      Object.entries(pathToExpectedString).forEach(([path, expectedString]) => {
        cy.visit(path);
        cy.findByText(expectedString);
      });
    });
  });
});

const selectLocale = (localeName: string) => {
  cy.visit("/account/profile");

  cy.findByTestId("user-profile-form").findByText("Use site default").click();
  H.popover().within(() => cy.findByText(localeName).click());

  cy.button("Update").click();
  cy.wait("@updateUserSettings");
};
