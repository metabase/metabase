import {
  blockSnowplow,
  describeWithSnowplow,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
} from "__support__/e2e/helpers";

// we're testing for one known (en) and one unknown (xx) locale
const locales = ["en", "xx"];

describe("scenarios > setup", () => {
  locales.forEach(locale => {
    beforeEach(() => restore("blank"));

    it(`should allow you to sign up using "${locale}" browser locale`, () => {
      // intial redirection and welcome page
      cy.visit("/", {
        // set the browser language as per:
        // https://glebbahmutov.com/blog/cypress-tips-and-tricks/index.html#control-navigatorlanguage
        onBeforeLoad(win) {
          Object.defineProperty(win.navigator, "language", {
            value: locale,
          });
        },
      });
      cy.location("pathname").should("eq", "/setup");
      cy.findByText("Welcome to Metabase");
      cy.findByTextEnsureVisible("Let's get started").click();

      // ========
      // Language
      // ========

      cy.findByText("What's your preferred language?");
      cy.findByLabelText("English");
      cy.findByText("Next").click();

      // ====
      // User
      // ====

      // "Next" should be disabled on the blank form
      // NOTE: unclear why cy.findByText("Next", { selector: "button" }) doesn't work
      // alternative: cy.contains("Next").should("be.disabled");
      cy.findByText("Next")
        .closest("button")
        .should("be.disabled");

      cy.findByLabelText("First name").type("Testy");
      cy.findByLabelText("Last name").type("McTestface");
      cy.findByLabelText("Email").type("testy@metabase.test");
      cy.findByLabelText("Company or team name").type("Epic Team");

      // test first with a weak password
      cy.findByLabelText("Create a password").type("password");
      cy.findByLabelText("Confirm your password").type("password");

      // the form shouldn't be valid yet and we should display an error
      cy.findByText("must include one number", { exact: false });
      cy.findByText("Next")
        .closest("button")
        .should("be.disabled");

      // now try a strong password that doesn't match
      const strongPassword = "QJbHYJN3tPW[";
      cy.findByLabelText(/^Create a password/)
        .clear()
        .type(strongPassword);
      cy.findByLabelText(/^Confirm your password/)
        .clear()
        .type(strongPassword + "foobar")
        .blur();

      // tell the user about the mismatch after clicking "Next"
      cy.findByText("Next")
        .closest("button")
        .should("be.disabled");
      cy.findByText("passwords do not match", { exact: false });

      // fix that mismatch
      cy.findByLabelText(/^Confirm your password/)
        .clear()
        .type(strongPassword);

      // Submit the first section
      cy.findByText("Next").click();

      // ========
      // Database
      // ========

      // The database step should be open
      cy.findByText("Add your data");

      // test database setup help card is NOT displayed before DB is selected
      cy.findByText("Need help connecting?").should("not.be.visible");

      // test that you can return to user settings if you want
      cy.findByText("Hi, Testy. Nice to meet you!").click();
      cy.findByLabelText("Email").should("have.value", "testy@metabase.test");

      // test database setup help card is NOT displayed on other steps
      cy.findByText("Need help connecting?").should("not.be.visible");

      // now back to database setting
      cy.findByText("Next").click();

      // check database setup card is visible
      cy.findByText("MySQL").click();
      cy.findByText("Need help connecting?").should("be.visible");

      cy.findByLabelText("Remove database").click();
      cy.findByPlaceholderText("Search for a database…").type("SQL");
      cy.findByText("SQLite").click();
      cy.findByText("Need help connecting?");

      // add h2 database
      cy.findByLabelText("Remove database").click();
      cy.findByText("Show more options").click();
      cy.findByText("H2").click();
      cy.findByLabelText("Display name").type("Metabase H2");
      cy.findByText("Next")
        .closest("button")
        .should("be.disabled");

      const dbFilename = "frontend/test/__runner__/empty.db";
      const dbPath = Cypress.config("fileServerFolder") + "/" + dbFilename;
      cy.findByLabelText("Connection String").type(`file:${dbPath}`);
      cy.findByText("Next")
        .closest("button")
        .should("not.be.disabled")
        .click();

      // test database setup help card is hidden on the next step
      cy.findByText("Need help connecting?").should("not.be.visible");

      // ================
      // Data Preferences
      // ================

      // collection defaults to on and describes data collection
      cy.findByText("All collection is completely anonymous.");
      // turn collection off, which hides data collection description
      cy.findByLabelText(
        "Allow Metabase to anonymously collect usage events",
      ).click();
      cy.findByText("All collection is completely anonymous.").should(
        "not.exist",
      );
      cy.findByText("Finish").click();

      // ==================
      // Finish & Subscribe
      // ==================
      cy.findByText("You're all set up!");
      cy.findByText(
        "Get infrequent emails about new releases and feature updates.",
      );
      cy.findByText("Take me to Metabase").click();
      cy.location("pathname").should("eq", "/");
    });
  });

  it("should allow pre-filling user details", () => {
    cy.visit(`/setup#123456`);

    cy.findByText("Welcome to Metabase");
    cy.findByTextEnsureVisible("Let's get started").click();

    cy.findByText("What's your preferred language?");
    cy.findByLabelText("English");
    cy.findByText("Next").click();

    cy.findByLabelText("First name").should("have.value", "Testy");
    cy.findByLabelText("Last name").should("have.value", "McTestface");
    cy.findByLabelText("Email").should("have.value", "testy@metabase.test");
    cy.findByLabelText("Company or team name").should(
      "have.value",
      "Epic Team",
    );
  });
});

describeWithSnowplow("scenarios > setup", () => {
  beforeEach(() => {
    restore("blank");
    resetSnowplow();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events", () => {
    // 1 - new_instance_created
    // 2 - pageview
    cy.visit(`/setup`);

    // 3 - setup/step_seen
    cy.findByText("Welcome to Metabase");
    cy.button("Let's get started").click();

    // 4 - setup/step_seen
    cy.findByText("What's your preferred language?");

    expectGoodSnowplowEvents(4);
  });

  it("should ignore snowplow failures and work as normal", () => {
    // 1 - new_instance_created
    blockSnowplow();
    cy.visit(`/setup`);

    cy.findByText("Welcome to Metabase");
    cy.button("Let's get started").click();

    expectGoodSnowplowEvents(1);
  });
});
