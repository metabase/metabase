import { USERS } from "e2e/support/cypress_data";
import {
  blockSnowplow,
  describeEE,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectGoodSnowplowEvents,
  expectNoBadSnowplowEvents,
  isEE,
  main,
  popover,
  resetSnowplow,
  restore,
} from "e2e/support/helpers";

const { admin } = USERS;

// we're testing for one known (en) and one unknown (xx) locale
const locales = ["en", "xx"];

describe("scenarios > setup", () => {
  locales.forEach(locale => {
    beforeEach(() => restore("blank"));

    it(
      `should allow you to sign up using "${locale}" browser locale`,
      { tags: ["@external"] },
      () => {
        // initial redirection and welcome page
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

        skipWelcomePage();

        cy.findByTestId("setup-forms").within(() => {
          selectPreferredLanguageAndContinue();

          // ====
          // User
          // ====

          // "Next" should be disabled on the blank form
          cy.findByRole("button", { name: "Next" }).should("be.disabled");
          cy.findByLabelText("First name").type("Testy");
          cy.findByLabelText("Last name").type("McTestface");
          cy.findByLabelText("Email").type("testy@metabase.test");
          cy.findByLabelText("Company or team name").type("Epic Team");

          // test first with a weak password
          cy.findByLabelText("Create a password").type("password");
          cy.findByLabelText("Confirm your password").type("password");

          // the form shouldn't be valid yet and we should display an error
          cy.findByText("must include one number", { exact: false });
          cy.findByRole("button", { name: "Next" }).should("be.disabled");

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
          cy.findByRole("button", { name: "Next" }).should("be.disabled");
          cy.findByText("passwords do not match", { exact: false });

          // fix that mismatch
          cy.findByLabelText(/^Confirm your password/)
            .clear()
            .type(strongPassword);

          // Submit the first section
          cy.findByText("Next").click();

          // ========
          // Usage question
          // ========

          cy.button("Next").click();

          // ========
          // Database
          // ========

          // The database step should be open
          cy.findByText("Add your data");

          // test database setup help card is NOT displayed before DB is selected
          cy.findByText("Need help connecting?").should("not.be.visible");

          // check database setup card is visible
          cy.findByText("MySQL").click();
          cy.findByText("Need help connecting?").should("be.visible");
          cy.findByLabelText("Remove database").click();
          cy.findByPlaceholderText("Search for a database…").type("SQL");
          cy.findByText("SQLite").click();
          cy.findByText("Need help connecting?");

          // remove sqlite database
          cy.findByLabelText("Remove database").click();
          cy.findByText("I'll add my data later").click();

          // test database setup help card is hidden on the next step
          cy.findByText("Need help connecting?").should("not.be.visible");

          skipLicenseStepOnEE();

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
        });

        cy.location("pathname").should("eq", "/");
      },
    );
  });

  it("should set up Metabase without first name and last name (metabase#22754)", () => {
    // This is a simplified version of the "scenarios > setup" test
    cy.visit("/");

    cy.location("pathname").should("eq", "/setup");

    skipWelcomePage();

    cy.findByTestId("setup-forms").within(() => {
      selectPreferredLanguageAndContinue();

      // User
      fillUserAndContinue({
        ...admin,
        company_name: "Epic team",
        first_name: null,
        last_name: null,
      });

      cy.findByText("Hi. Nice to meet you!");

      cy.button("Next").click();

      // Database
      cy.findByText("Add your data");
      cy.findByText("I'll add my data later").click();

      skipLicenseStepOnEE();

      // Turns off anonymous data collection
      cy.findByLabelText(
        "Allow Metabase to anonymously collect usage events",
      ).click();

      cy.findByText("All collection is completely anonymous.").should(
        "not.exist",
      );
      cy.button("Finish").click();

      // Finish & Subscribe
      cy.findByText("Take me to Metabase").click();
    });
    cy.location("pathname").should("eq", "/");

    main().findByText("Embed Metabase in your app").should("not.exist");
  });

  // Values in this test are set through MB_USER_DEFAULTS environment variable!
  // Please see https://github.com/metabase/metabase/pull/18763 for details
  it("should allow pre-filling user details", () => {
    cy.visit("/setup#123456");

    skipWelcomePage();

    selectPreferredLanguageAndContinue();

    cy.findByTestId("setup-forms").within(() => {
      cy.findByLabelText("First name").should("have.value", "Testy");
      cy.findByLabelText("Last name").should("have.value", "McTestface");
      cy.findByLabelText("Email").should("have.value", "testy@metabase.test");
      cy.findByLabelText("Company or team name").should(
        "have.value",
        "Epic Team",
      );
    });
  });

  it("should allow you to connect a db during setup", () => {
    const dbName = "SQLite db";

    cy.intercept("GET", "api/collection/root").as("getRootCollection");
    cy.intercept("GET", "api/database").as("getDatabases");

    cy.visit("/setup#123456");

    skipWelcomePage();

    selectPreferredLanguageAndContinue();

    cy.findByLabelText(/What should we call you/);

    cy.findByTestId("setup-forms").within(() => {
      const strongPassword = "QJbHYJN3tPW[";
      cy.findByLabelText(/^Create a password/)
        .clear()
        .type(strongPassword, { delay: 0 });
      cy.findByLabelText(/^Confirm your password/)
        .clear()
        .type(strongPassword, { delay: 0 })
        .blur();
    });

    cy.findByLabelText(/What should we call you/)
      .button("Next")
      .click();

    // make sure this bit of the form loads before clicking next
    cy.findByLabelText(/What will you use Metabase for/).findByText(
      /Let us know your plans/,
    );

    cy.findByLabelText(/What will you use Metabase for/)
      .button("Next")
      .click();

    cy.findByTestId("database-form").within(() => {
      cy.findByPlaceholderText("Search for a database…").type("lite").blur();
      cy.findByText("SQLite").click();
      cy.findByLabelText("Display name").type(dbName);
      cy.findByLabelText("Filename").type("./resources/sqlite-fixture.db", {
        delay: 0,
      });
      cy.button("Connect database").click();
    });

    skipLicenseStepOnEE();

    // usage data
    cy.get("section")
      .last()
      .findByText(/certain data about product usage/);
    cy.get("section").last().button("Finish").click();

    // done
    cy.get("section")
      .last()
      .findByText(/You're all set up/);
    cy.get("section")
      .last()
      .findByRole("link", { name: "Take me to Metabase" })
      .click();

    // in app
    cy.location("pathname").should("eq", "/");
    cy.wait(["@getRootCollection", "@getDatabases"]);

    cy.get("main").within(() => {
      cy.findByText("Here are some explorations of");
      cy.findAllByRole("link").should("contain", dbName);
    });

    cy.visit("/browse/databases");
    cy.findByTestId("database-browser").findByText(dbName);
  });

  it("embedded use-case, it should hide the db step and show the embedding homepage", () => {
    cy.visit("/setup");

    cy.location("pathname").should("eq", "/setup");

    skipWelcomePage();

    selectPreferredLanguageAndContinue();

    cy.findByTestId("setup-forms").within(() => {
      // User
      fillUserAndContinue({
        ...admin,
        company_name: "Epic team",
        first_name: null,
        last_name: null,
      });

      cy.findByText("Hi. Nice to meet you!");

      cy.findByText("Embedding analytics into my application").click();
      cy.button("Next").click();

      // Database
      cy.findByText("Add your data").should("not.exist");

      skipLicenseStepOnEE();

      // Turns off anonymous data collection
      cy.findByLabelText(
        "Allow Metabase to anonymously collect usage events",
      ).click();

      cy.findByText("All collection is completely anonymous.").should(
        "not.exist",
      );

      cy.get("section")
        .last()
        .findByText(/certain data about product usage/);
      cy.get("section").last().button("Finish").click();

      // Finish & Subscribe
      cy.intercept("GET", "/api/session/properties").as("properties");
      cy.get("section")
        .last()
        .findByRole("link", { name: "Take me to Metabase" })
        .click();
    });

    cy.log(
      "Make sure the embedding secret key is set after embedding has been autoenabled",
    );
    cy.wait("@properties").then(request => {
      expect(request.response?.body["embedding-secret-key"]?.length).to.equal(
        64,
      );
    });

    cy.location("pathname").should("eq", "/");

    main()
      .findByText("Get started with Embedding Metabase in your app")
      .should("exist");

    // should persist page loads
    cy.reload();

    main()
      .findByText("Get started with Embedding Metabase in your app")
      .should("exist");

    main().findByText("Hide these").realHover();

    popover().findByText("Embedding done, all good").click();

    main()
      .findByText("Get started with Embedding Metabase in your app")
      .should("not.exist");
  });
});

describeEE("scenarios > setup (EE)", () => {
  beforeEach(() => restore("blank"));

  it("should ask for a license token on self-hosted", () => {
    cy.visit("/setup");

    skipWelcomePage();

    selectPreferredLanguageAndContinue();

    cy.findByTestId("setup-forms").within(() => {
      fillUserAndContinue({
        ...admin,
        company_name: "Epic team",
      });

      cy.button("Next").click();

      cy.findByText("I'll add my data later").click();

      cy.findByText("Activate your commercial license").should("exist");

      typeToken(Cypress.env("NO_FEATURES_TOKEN"));

      cy.button("Activate").click();

      cy.findByText("Finish").click();
      cy.findByText("Take me to Metabase").click();
    });

    cy.intercept("/api/premium-features/token/status").as("tokenStatus");

    cy.visit("/admin/settings/license");

    main().findByText("Looking for more?").should("exist");

    cy.wait("@tokenStatus").then(request => {
      expect(request.response?.body.valid).to.equal(true);
    });
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
    let goodEvents = 0;

    goodEvents++; // 1 - new_instance_created
    goodEvents++; // 2 - pageview
    cy.visit("/setup");

    goodEvents++; // 3 - setup/step_seen "welcome"
    expectGoodSnowplowEvent({
      event: "step_seen",
      step_number: 0,
      step: "welcome",
    });
    skipWelcomePage();

    goodEvents++; // 4 - setup/step_seen  "language"
    expectGoodSnowplowEvent({
      event: "step_seen",
      step_number: 1,
      step: "language",
    });
    selectPreferredLanguageAndContinue();

    goodEvents++; // 5 - setup/step_seen "user_info"
    expectGoodSnowplowEvent({
      event: "step_seen",
      step_number: 2,
      step: "user_info",
    });

    cy.findByTestId("setup-forms").within(() => {
      fillUserAndContinue({
        ...admin,
        company_name: "Epic team",
      });

      cy.findByText("What will you use Metabase for?").should("exist");
      goodEvents++; // 6 - setup/step_seen "usage_question"
      expectGoodSnowplowEvent({
        event: "step_seen",
        step_number: 3,
        step: "usage_question",
      });
      cy.button("Next").click();

      goodEvents++; // 7 - setup/usage_reason_selected
      expectGoodSnowplowEvent({
        event: "usage_reason_selected",
        usage_reason: "self-service-analytics",
      });

      goodEvents++; // 8 - setup/step_seen "db_connection"
      expectGoodSnowplowEvent({
        event: "step_seen",
        step_number: 4,
        step: "db_connection",
      });
      cy.findByText("I'll add my data later").click();

      goodEvents++; // 9/10 - setup/add_data_later_clicked
      expectGoodSnowplowEvent({
        event: "add_data_later_clicked",
      });

      // This step is only visile on EE builds
      if (isEE) {
        goodEvents++; // 10/11 - setup/step_seen "commercial_license"
        expectGoodSnowplowEvent({
          event: "step_seen",
          step_number: 5,
          step: "license_token",
        });

        cy.button("Skip").click();
        goodEvents++; // 11/12 - setup/step_seen "commercial_license"
        expectGoodSnowplowEvent({
          event: "license_token_step_submitted",
          valid_token_present: false,
        });
      }

      goodEvents++; // 11/12 - setup/step_seen "data_usage"
      expectGoodSnowplowEvent({
        event: "step_seen",
        step_number: isEE ? 6 : 5,
        step: "data_usage",
      });

      cy.findByRole("button", { name: "Finish" }).click();
      goodEvents++; // 12/13- - new_user_created (from BE)

      goodEvents++; // 13/14- setup/step_seen "completed"
      expectGoodSnowplowEvent({
        event: "step_seen",
        step_number: isEE ? 7 : 6,
        step: "completed",
      });

      expectGoodSnowplowEvents(goodEvents);
    });
  });

  it("should ignore snowplow failures and work as normal", () => {
    blockSnowplow();
    cy.visit("/setup");
    skipWelcomePage();

    // 1 event is sent from the BE, which isn't blocked by blockSnowplow()
    expectGoodSnowplowEvents(1);
  });
});

const skipWelcomePage = () => {
  cy.findByTestId("welcome-page").within(() => {
    cy.findByText("Welcome to Metabase");
    cy.findByText("Let's get started").click();
  });
};

const selectPreferredLanguageAndContinue = () => {
  cy.findByText("What's your preferred language?");
  cy.findByLabelText("English");
  cy.findByText("Next").click();
};

const fillUserAndContinue = ({
  email,
  first_name,
  last_name,
  password,
  company_name,
}: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  password?: string | null;
  company_name?: string | null;
}) => {
  cy.findByText("What should we call you?");

  if (first_name) {
    cy.findByLabelText("First name").type(first_name);
  }
  if (last_name) {
    cy.findByLabelText("Last name").type(last_name);
  }
  if (email) {
    cy.findByLabelText("Email").type(email);
  }
  if (company_name) {
    cy.findByLabelText("Company or team name").type(company_name);
  }
  if (password) {
    cy.findByLabelText("Create a password").type(password);
  }
  if (password) {
    cy.findByLabelText("Confirm your password").type(password);
  }
  cy.button("Next").click();
};

const skipLicenseStepOnEE = () => {
  if (isEE) {
    cy.findByText("Activate your commercial license").should("exist");
    cy.button("Skip").click();
  }
};

const typeToken = (token: string) => {
  // hides the requests from the logs as the token is passed as a GET param
  cy.intercept({ resourceType: "xhr" }, { log: false });
  cy.findByLabelText("Token")
    // hides the token from failure screenshots
    .invoke("attr", "type", "password")
    .type(token, { log: false });
};
