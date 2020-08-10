import path from "path";
import { restore } from "__support__/cypress";

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
      cy.url().should("be", "/setup");
      cy.findByText("Welcome to Metabase");
      cy.findByText("Let's get started").click();

      // ========
      // Language
      // ========

      cy.findByText("What's your preferred language?");
      cy.findByText("English").click();
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
      cy.findByLabelText("Email").type("testy@metabase.com");
      cy.findByLabelText("Your company or team name").type("Epic Team");

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
      cy.findByLabelText("Create a password")
        .clear()
        .type(strongPassword);
      cy.findByLabelText("Confirm your password")
        .clear()
        .type(strongPassword + "foobar")
        .blur();

      // tell the user about the mismatch after clicking "Next"
      cy.findByText("Next")
        .closest("button")
        .should("be.disabled");
      cy.findByText("passwords do not match", { exact: false });

      // fix that mismatch
      cy.findByLabelText("Confirm your password")
        .clear()
        .type(strongPassword);

      // Submit the first section
      cy.findByText("Next").click();

      // ========
      // Database
      // ========

      // The database step should be open
      cy.findByText("You’ll need some info about your database", {
        exact: false,
      });

      // test that you can return to user settings if you want
      cy.findByText("Hi, Testy. Nice to meet you!").click();
      cy.findByLabelText("Email").should("have.value", "testy@metabase.com");

      // now back to database setting
      cy.findByText("Next").click();

      // add h2 database
      cy.findByText("Select a database").click();
      cy.findByText("H2").click();
      cy.findByLabelText("Name").type("Metabase H2");
      cy.findByText("Next")
        .closest("button")
        .should("be.disabled");

      const dbPath = path.resolve(
        Cypress.config("fileServerFolder"),
        "frontend/test/__runner__/empty.db",
      );
      cy.findByLabelText("Connection String").type(`file:${dbPath}`);
      cy.findByText("Next")
        .closest("button")
        .should("not.be.disabled")
        .click();

      // return to db settings and turn on manual scheduling
      cy.findByText("Connecting to Metabase H2").click();
      cy.findByLabelText(
        "This is a large database, so let me choose when Metabase syncs and scans",
      ).click();
      cy.findByText("Next").click();

      // now, we should see the sync scheduling form
      cy.findByText("Scanning for Filter Values");
      cy.findByText("Never, I'll do this manually if I need to").click();
      cy.findByText("Next").click();

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
      cy.findByText("Next").click();

      // ==================
      // Finish & Subscribe
      // ==================
      cy.findByText("You're all set up!");
      cy.findByText(
        "Get infrequent emails about new releases and feature updates.",
      );
      cy.findByText("Take me to Metabase").click();
      cy.url().should("be", "/");
    });
  });
});
