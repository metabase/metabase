const { H } = cy;

H.describeWithSnowplowEE("scenarios > setup embedding (EMB-477)", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore("blank");
  });

  it("should redirect correctly from `/setup?use_case=embedding&new_embedding_flow=true&first_name=First&last_name=Last&email=testy@metabase.test&site_name=Epic%20Team`", () => {
    cy.visit(
      "/setup?use_case=embedding&new_embedding_flow=true&first_name=First&last_name=Last&email=testy@metabase.test&site_name=Epic%20Team",
    );
    cy.location("pathname").should("eq", "/setup/embedding");
    cy.location("search").should(
      "eq",
      "?use_case=embedding&new_embedding_flow=true&first_name=First&last_name=Last&email=testy@metabase.test&site_name=Epic%20Team",
    );

    // `/setup` should not be rendered and its events should not be sent to not add noise to events
    H.assertNoUnstructuredSnowplowEvent({
      event: "step_seen", // `step_seen` event is sent on `/setup`, on `/setup/embedding` we send `embedding_setup_step_seen`
    });
  });

  it("should allow users to use existing setup flow", () => {
    cy.visit("/setup/embedding");
    assertEmbeddingOnboardingPageLoaded();

    cy.findByRole("link", { name: "Set up manually" })
      .should("be.visible")
      .click();

    cy.findByTestId("welcome-page").within(() => {
      cy.findByRole("heading", { name: "Welcome to Metabase" }).should(
        "be.visible",
      );
      cy.findByText(
        "Looks like everything is working. Now let’s get to know you, connect to your data, and start finding you some answers!",
      ).should("be.visible");
      cy.button("Let's get started").should("be.visible");
    });

    cy.location("pathname").should("eq", "/setup");
  });

  it("should show the embedding homepage if the user skips the flow after having created the user", () => {
    cy.visit("/setup/embedding");
    assertEmbeddingOnboardingPageLoaded();

    step().within(() => {
      cy.button("Start").should("be.visible").click();
    });

    step().within(() => {
      cy.findByRole("heading", { name: "What should we call you?" }).should(
        "be.visible",
      );

      fillOutUserForm();

      cy.intercept("POST", "/api/setup").as("setup");
      cy.intercept("PUT", "/api/setting").as("setting");
      cy.button("Next").should("be.enabled").click();
    });

    cy.wait("@setup");
    // We set the embedding homepage as visible right after we create the
    // user, we need to make sure that request is done before navigating
    // otherwise it'll get cancelled by the browser
    cy.wait("@setting");
    cy.visit("/");

    H.main()
      .findByText("Get started with Embedding Metabase in your app")
      .should("be.visible");
  });

  it("[cloud-hosted] should allow users to go through the embedding setup and onboarding flow", () => {
    // mock `is-hosted`, we can't set the token before the user is created, we'll set it right after that
    H.activateToken("pro-cloud");

    mockCloudHosted();

    cy.visit(
      "/setup/embedding?first_name=Firstname&last_name=Lastname&email=testy@metabase.test&site_name=Epic Team",
    );

    cy.log("0: Welcome step");
    assertEmbeddingOnboardingPageLoaded();

    H.expectUnstructuredSnowplowEvent({
      event: "embedding_setup_step_seen",
      event_detail: "welcome",
    });

    step().within(() => {
      cy.findByText(
        /Let's get you up and running with a starting setup for embedded analytics/,
      ).should("be.visible");
      cy.button("Start").should("be.visible").click();
    });

    cy.log("1: User creation step");
    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Set up your account",
      );
    });
    step().within(() => {
      cy.findByRole("heading", { name: "What should we call you?" }).should(
        "be.visible",
      );

      H.expectUnstructuredSnowplowEvent({
        event: "embedding_setup_step_seen",
        event_detail: "user-creation",
      });

      cy.findByLabelText("First name").should("have.value", "Firstname");
      cy.findByLabelText("Last name").should("have.value", "Lastname");
      cy.findByLabelText("Email").should("have.value", "testy@metabase.test");
      cy.findByLabelText("Company or team name").should(
        "have.value",
        "Epic Team",
      );

      fillOutUserForm();

      cy.intercept("POST", "/api/setup").as("setup");
      cy.button("Next").should("be.enabled").click();
    });

    cy.log(
      "Now we have a user we simulate being on cloud by setting a Metatabase Token",
    );
    cy.wait("@setup");

    // set a real token so we have real token-features for the rest of the flow
    H.activateToken("pro-cloud");

    cy.log("2: Data connection step");
    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Connect to your data",
      );
    });
    step().within(() => {
      cy.findByRole("heading", { name: "Connect to your data" }).should(
        "be.visible",
      );

      cy.findByRole("option", { name: "PostgreSQL" }).click();
      fillOutDatabaseForm();

      cy.log("simulate database that takes some time to fully sync");
      const NO_OF_MIN_RETRY = 4;
      let currentRetry = 0;
      cy.intercept("GET", "api/database", (req) => {
        req.on("response", (res) => {
          currentRetry++;
          const [postgresDb] = res.body.data;
          if (
            postgresDb.initial_sync_status !== "complete" ||
            currentRetry < NO_OF_MIN_RETRY
          ) {
            // Simulate syncing not complete until we reach a certain number of retries
            postgresDb.initial_sync_status = "incomplete";
          }
        });
      });
      cy.button("Connect database").should("be.enabled").click();
    });

    cy.log("3: Content generation step");
    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Generate starter content",
      );
    });

    const SECOND = 1000;
    // Waiting for the database sync to complete
    step()
      .findByRole("heading", {
        name: "Select Tables to Embed",
        timeout: 10 * SECOND,
      })
      .should("be.visible");

    expectNoDatabaseStatus();

    step().within(() => {
      cy.findByRole("checkbox", { name: "feedback" })
        .should("be.enabled")
        .check();
      cy.findByRole("checkbox", { name: "orders" })
        .should("be.enabled")
        .check();
      cy.findByRole("checkbox", { name: "products" })
        .should("be.enabled")
        .check();

      cy.button("Continue").should("be.enabled").click();
    });

    cy.log("4: Processing step");

    step().within(() => {
      cy.findByRole("heading", { name: "Setting Up Your Analytics" }).should(
        "be.visible",
      );
      /**
       * Since this loader will go away automatically it's crucial to wait for it to go away
       * before start asserting the next steps.
       */
      cy.findByText("Creating dashboards...").should("not.exist");
    });

    cy.log("5: Embed in your app step");
    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Add to your app",
      );
    });

    step().within(() => {
      cy.findByRole("heading", { name: "Add to your app" }).should(
        "be.visible",
      );
      cy.findByRole("tab", { name: 'A look at "Feedback"' }).click();
      H.getIframeBody().within(() => {
        cy.findByText('A look at "Feedback"').should("be.visible");
      });
      cy.findByRole("code").contains(
        new RegExp(
          `<iframe src="${Cypress.config("baseUrl")}/dashboard/\\d+" width="800px" height="500px" />`,
        ),
      );

      cy.button("I see Metabase").click();

      cy.findByRole("heading", { name: "You're on your way!" }).should(
        "be.visible",
      );
      cy.findByRole("link", { name: "Take me to Metabase" }).click();
    });

    cy.log("5: Metabase");
    cy.button("New").should("be.visible");

    cy.log(
      "Only one 'Automatically Generated Dashboards' collection should be created",
    );
    sidebar().within(() => {
      cy.findByText("Automatically Generated Dashboards").should("be.visible");
      cy.findByText("Automatically Generated Dashboards").should(
        "have.length",
        1,
      );
    });
    expectNoDatabaseStatus();
  });
});

/**
 * Before the user creation we can't set the token, as that uses api calls that require being logged as admin.
 * This simulates at least the `hosted/is-hosted?`
 */
const mockCloudHosted = () => {
  cy.intercept("GET", "api/session/properties", (req) => {
    req.on("response", (res) => {
      res.body["is-hosted?"] = true;
      res.body["token-features"] = {
        ...res.body["token-features"],
        hosting: true,
      };
    });
  });
};

function expectNoDatabaseStatus() {
  cy.log("Ensure the database sync status is not shown");
  cy.findByRole("status").should("not.exist");
}

function assertEmbeddingOnboardingPageLoaded() {
  cy.findByLabelText("Embedding Setup Sidebar")
    .findByText("Embedded Analytics")
    .should("be.visible");
}

function step() {
  return cy.findByRole("region", { name: "Embedding setup current step" });
}

function sidebar() {
  return cy.findByRole("complementary");
}

const TYPE_DELAY = 0;

function fillOutUserForm() {
  cy.findByLabelText("First name").clear().type("Testy", { delay: TYPE_DELAY });
  cy.findByLabelText("Last name")
    .clear()
    .type("McTestface", { delay: TYPE_DELAY });
  cy.findByLabelText("Email")
    .clear()
    .type("testy@metabase.test", { delay: TYPE_DELAY });
  cy.findByLabelText("Company or team name")
    .clear()
    .type("Epic Team", { delay: TYPE_DELAY });

  cy.findByLabelText(/Create a password/).type("metabase123", {
    delay: TYPE_DELAY,
  });
  cy.findByLabelText("Confirm your password").type("metabase123", {
    delay: TYPE_DELAY,
  });
}

function fillOutDatabaseForm() {
  cy.findByLabelText("Display name").type("Postgres Database", {
    delay: TYPE_DELAY,
  });
  cy.findByLabelText("Host").type("localhost", { delay: TYPE_DELAY });
  cy.findByLabelText("Port").type("5404", { delay: TYPE_DELAY });
  cy.findByLabelText("Database name").type("sample", { delay: TYPE_DELAY });
  cy.findByLabelText("Username").type("metabase", { delay: TYPE_DELAY });
  cy.findByLabelText("Password").type("metasample123", { delay: TYPE_DELAY });
}
