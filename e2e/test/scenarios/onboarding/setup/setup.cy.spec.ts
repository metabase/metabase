const { H } = cy;
const IS_ENTERPRISE = Cypress.expose("IS_ENTERPRISE");
import { USERS } from "e2e/support/cypress_data";

const { admin } = USERS;

describe("scenarios > setup", () => {
  beforeEach(() => {
    H.restore("blank");
    H.resetSnowplow();
  });

  it("should pre-fill user info for hosted instances (infra-frontend#1109)", () => {
    H.mockSessionProperty("is-hosted?", true);

    cy.visit(
      "/setup?first_name=John&last_name=Doe&email=john@doe.test&site_name=Doe%20Unlimited",
    );

    skipWelcomePage();

    cy.findByTestId("setup-forms").within(() => {
      cy.findByDisplayValue("John").should("exist");
      cy.findByDisplayValue("Doe").should("exist");
      cy.findByDisplayValue("john@doe.test").should("exist");
      cy.findByDisplayValue("Doe Unlimited").should("exist");
      cy.findByLabelText("Create a password").should("be.empty");
    });
  });

  it("should not show 'Sample Database' if env var is explicitly set to false during setup", () => {
    H.mockSessionProperty("has-sample-database?", false);

    navigateToDatabaseStep();

    cy.findByLabelText("Add your data").within(() => {
      cy.button("Continue with sample data").should("not.exist");
      cy.button("I'll add my data later").click();
    });

    cy.log("We're done with the database step");
    cy.findByLabelText("I'll add my own data later").should("be.visible");
  });

  it("should create a new user upon inviting a teammate", () => {
    H.mockSessionProperty("email-configured?", true);

    navigateToDatabaseStep();
    cy.findByTestId("step-number").should("have.text", "3");

    cy.findByLabelText("Setup section").click();
    cy.findByLabelText("First name").type("TeammateFirstName");
    cy.findByLabelText("Last name").type("TeammateLastName");
    cy.findByLabelText("Email").type("teammate@metabase.test");
    cy.intercept("POST", "/api/user").as("createUser");

    cy.button("Send invitation").click();

    cy.wait("@createUser").then((interception) => {
      expect(interception.request.body).to.include({
        first_name: "TeammateFirstName",
        last_name: "TeammateLastName",
        email: "teammate@metabase.test",
      });
    });

    // Checks invite event was sent
    H.expectUnstructuredSnowplowEvent({
      event: "invite_sent",
      source: "setup",
    });

    // Checks we are now in the next step
    cy.findByTestId("step-number").should("have.text", "4");
  });

  // There are only one step in the setup flow, so there is no need to show step numbers.
  it("should not show step numbers in cloud embedding use case", () => {
    H.mockSessionProperty("is-hosted?", true);
    H.mockSessionProperty("token-features", { hosting: true });

    cy.visit(
      "/setup?first_name=John&last_name=Doe&email=john@doe.test&site_name=Doe%20Unlimited&use_case=embedding",
    );

    H.main().findByText("What should we call you?").should("be.visible");
    cy.findByTestId("step-number").should("not.exist");
  });
});

describe("scenarios > setup > AI config step", () => {
  const MOCK_LLM_PORT = 6123;

  beforeEach(() => {
    H.restore("blank");
  });

  afterEach(() => {
    cy.task("stopMockLlmServer");
  });

  const navigateToAiConfigStep = () => {
    navigateToDatabaseStep();
    cy.findByTestId("setup-forms")
      .findByText("Continue with sample data")
      .click();
    finishSetup();
    startAiConfigStep();
  };

  it("should offer BYOK providers without the managed option and allow skipping", () => {
    navigateToAiConfigStep();

    cy.findByLabelText("Connect to an AI provider").within(() => {
      cy.findByRole("button", { name: /OpenAI/ }).should("be.visible");
      cy.findByRole("button", { name: /OpenRouter/ }).should("be.visible");
      cy.findByRole("button", { name: /Microsoft Azure/ }).should("be.visible");
      cy.findByRole("button", { name: /Amazon Bedrock/ }).should("be.visible");
      // the managed provider is offered but not connectable without the LLM proxy,
      // which e2e does not configure
      cy.findByRole("button", { name: /Metabase/ }).should("be.disabled");

      cy.findByRole("button", { name: /Anthropic/ }).click();
      cy.findByLabelText(/API key/).should("be.visible");
      cy.button("I'll set this up later").click();
    });

    cy.findByLabelText("I'll set up AI later").should("be.visible");
    cy.findByTestId("setup-forms").within(() => {
      cy.findByText("You're all set up!").should("be.visible");
      cy.button("Set up AI").should("not.exist");
    });
  });

  it("should connect an Anthropic API key during setup", () => {
    cy.task("startMockLlmServer", {
      port: MOCK_LLM_PORT,
      responseText: "Hello from mock LLM!",
    });
    cy.intercept("POST", "/api/llm/providers").as("connectProvider");

    navigateToAiConfigStep();

    cy.findByLabelText("Connect to an AI provider").within(() => {
      cy.findByRole("button", { name: /Anthropic/ }).click();
      cy.findByLabelText(/API key/).type("sk-ant-api03-e2e-test-key");

      // The base URL belongs to the connection now rather than to a global setting, so
      // this is what points the credential-verifying /v1/models call at the mock server.
      cy.findByRole("button", { name: /Advanced settings/ }).click();
      cy.findByLabelText("API base URL").type(
        `http://localhost:${MOCK_LLM_PORT}`,
      );

      cy.button("Connect").click();
      cy.wait("@connectProvider");

      cy.findByLabelText("Model").should("be.visible");
      cy.button("Done").click();
    });

    cy.findByLabelText("Connected to Anthropic").should("be.visible");
  });

  it("should connect the Metabase managed provider during setup", () => {
    // The "Metabase" provider option is gated on token features read at page
    // bootstrap (plugin init), before any interceptable API call — so patch
    // the server-embedded payload as it is assigned. We can't use
    // `H.activateToken` here because the endpoint requires a user.. which
    // isn't created yet.
    // The store-backed calls (add-ons pricing, the managed connect itself)
    // have no real backing in e2e and are stubbed at the network layer.
    type BootstrapPayload = {
      "token-features"?: Record<string, boolean>;
    } & Record<string, unknown>;

    const enableManagedAiFeatures = (win: Cypress.AUTWindow) => {
      let bootstrap: BootstrapPayload | undefined;
      Object.defineProperty(win, "MetabaseBootstrap", {
        configurable: true,
        get: () => bootstrap,
        set: (value: BootstrapPayload) => {
          bootstrap = {
            ...value,
            "token-features": {
              ...value["token-features"],
              "metabase-ai-managed": true,
              "offer-metabase-ai-managed": true,
            },
          };
        },
      });
    };

    const managedConnection = {
      key: "metabase",
      type: "metabase",
      name: "Metabase AI service",
      source: "db",
      usable: true,
      env_vars: [],
      config: {},
    };

    let isConnected = false;
    cy.intercept("GET", "/api/session/properties", (req) => {
      req.reply((res) => {
        res.body["token-features"] = {
          ...res.body["token-features"],
          "metabase-ai-managed": true,
          "offer-metabase-ai-managed": true,
        };
        if (isConnected) {
          res.body["llm-metabot-configured?"] = true;
          res.body["llm-metabot-provider"] =
            "metabase/anthropic/claude-sonnet-4-6";
        }
      });
    });
    // the managed type is only connectable once the LLM proxy is configured, which has no
    // backing in e2e, so mark it available the same way the token features are patched
    cy.intercept("GET", "/api/llm/provider-types", (req) => {
      req.reply((res) => {
        res.body = res.body.map((providerType: { type: string }) =>
          providerType.type === "metabase"
            ? { ...providerType, available: true }
            : providerType,
        );
      });
    });
    cy.intercept("GET", "/api/llm/providers", (req) => {
      req.reply(isConnected ? [managedConnection] : []);
    });
    cy.intercept("GET", "/api/ee/cloud-add-ons/addons", [
      {
        id: 1,
        active: true,
        self_service: true,
        deployment: "hosting",
        billing_period_months: 1,
        default_base_fee: 0,
        default_included_units: 0,
        default_prepaid_units: 1,
        free_units: 1_000_000,
        default_price_per_unit: 3.75 / 1_000_000,
        default_total_units: 1,
        description: null,
        is_metered: true,
        name: "Metabase AI Managed",
        product_tiers: [],
        product_type: "metabase-ai-managed",
        short_name: "Metabase AI Managed",
        token_features: [],
        trial_days: null,
      },
    ]);
    cy.intercept("GET", "/api/ee/metabot/usage", {
      is_locked: false,
      tokens: 0,
      free_tokens: 1000000,
      updated_at: null,
    });
    cy.intercept("POST", "/api/premium-features/token/refresh", {});
    cy.intercept("POST", "/api/llm/providers", (req) => {
      isConnected = true;
      req.reply(managedConnection);
    }).as("connectManaged");

    cy.visit(
      "/setup?first_name=John&last_name=Doe&email=john@doe.test&site_name=Doe%20Unlimited",
      { onBeforeLoad: enableManagedAiFeatures },
    );

    skipWelcomePage();

    cy.findByTestId("setup-forms").within(() => {
      const password = "12341234";
      cy.findByLabelText("Create a password").type(password);
      cy.findByLabelText("Confirm your password").type(password);
      cy.button("Next").click();

      cy.findByLabelText("What will you use Metabase for?").should(
        "be.visible",
      );
      cy.button("Next").click();

      cy.findByText("Continue with sample data").click();

      // the patched token features make this a paid plan, so the license step
      // is skipped even on EE
      cy.findByText("Finish").click();
    });

    startAiConfigStep();

    cy.findByLabelText("Connect to an AI provider").within(() => {
      cy.findByRole("button", { name: /Metabase/ }).click();
      cy.findByText(
        /The simplest way to get started with AI in Metabase/,
      ).should("be.visible");
      cy.findByText(/You get 1M tokens for free/).should("be.visible");
      cy.button("Connect").click();
    });

    cy.wait("@connectManaged")
      .its("request.body")
      .should("deep.equal", { type: "metabase" });
    cy.findByLabelText("Connected to Metabase AI service").should("be.visible");
  });

  it("should not offer the step when AI features are disabled", () => {
    H.mockSessionProperty("ai-features-enabled?", false);

    navigateToDatabaseStep();
    cy.findByTestId("setup-forms")
      .findByText("Continue with sample data")
      .click();

    skipLicenseStepOnEE();
    cy.findByLabelText("Usage data preferences").should("be.visible");
    cy.findByTestId("setup-forms").within(() => {
      cy.findByText("Finish").click();

      cy.findByText("You're all set up!").should("be.visible");
      cy.button("Set up AI").should("not.exist");
    });
  });
});

describe("scenarios > setup (EE)", () => {
  beforeEach(() => H.restore("blank"));

  it("should ask for a license token on self-hosted", () => {
    cy.visit("/setup");

    skipWelcomePage();

    cy.findByTestId("setup-forms").within(() => {
      fillUserAndContinue({
        ...admin,
        company_name: "Epic team",
      });

      cy.button("Next").click();

      cy.findByText("Continue with sample data").click();

      cy.findByText("Activate your commercial license").should("exist");

      // Use cy.env() for sensitive token values (async API)
      cy.env(["MB_STARTER_CLOUD_TOKEN"]).then(({ MB_STARTER_CLOUD_TOKEN }) => {
        typeToken(MB_STARTER_CLOUD_TOKEN);
      });

      cy.button("Activate").click();

      cy.findByText("Finish").click();
      cy.findByText("Take me to Metabase").click();
    });

    cy.intercept("/api/premium-features/token/status").as("tokenStatus");

    cy.visit("/admin/settings/license");

    H.main().findByText("Looking for more?").should("exist");

    cy.wait("@tokenStatus").then((request) => {
      expect(request.response?.body.valid).to.equal(true);
    });
  });
});

describe("scenarios > setup", () => {
  beforeEach(() => {
    H.restore("blank");
    H.resetSnowplow();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should send snowplow events", () => {
    cy.visit("/setup");

    H.expectUnstructuredSnowplowEvent({
      event: "step_seen",
      step_number: 0,
      step: "welcome",
    });
    skipWelcomePage();

    H.expectUnstructuredSnowplowEvent({
      event: "step_seen",
      step_number: 1,
      step: "user_info",
    });

    cy.findByTestId("setup-forms").within(() => {
      fillUserAndContinue({
        ...admin,
        company_name: "Epic team",
      });

      cy.findByText("What will you use Metabase for?").should("exist");
      H.expectUnstructuredSnowplowEvent({
        event: "step_seen",
        step_number: 2,
        step: "usage_question",
      });
      cy.button("Next").click();

      H.expectUnstructuredSnowplowEvent({
        event: "usage_reason_selected",
        usage_reason: "self-service-analytics",
      });

      H.expectUnstructuredSnowplowEvent({
        event: "step_seen",
        step_number: 3,
        step: "db_connection",
      });
      cy.findByText("Continue with sample data").click();

      H.expectUnstructuredSnowplowEvent({
        event: "add_data_later_clicked",
      });

      // This step is only visile on EE builds
      if (IS_ENTERPRISE) {
        H.expectUnstructuredSnowplowEvent({
          event: "step_seen",
          step_number: 4,
          step: "license_token",
        });

        cy.button("I'll activate later").click();
        H.expectUnstructuredSnowplowEvent({
          event: "license_token_step_submitted",
          valid_token_present: false,
        });
      }

      H.expectUnstructuredSnowplowEvent({
        event: "step_seen",
        step_number: IS_ENTERPRISE ? 5 : 4,
        step: "data_usage",
      });

      cy.findByRole("button", { name: "Finish" }).click();

      H.expectUnstructuredSnowplowEvent({
        event: "step_seen",
        step_number: IS_ENTERPRISE ? 6 : 5,
        step: "completed",
      });

      cy.button("Set up AI").click();

      H.expectUnstructuredSnowplowEvent({
        event: "ai_setup_started",
        triggered_from: "setup",
      });

      H.expectUnstructuredSnowplowEvent({
        event: "step_seen",
        step_number: IS_ENTERPRISE ? 6 : 5,
        step: "ai_config",
      });

      cy.button("I'll set this up later").click();

      H.expectUnstructuredSnowplowEvent({
        event: "ai_setup_later_clicked",
        triggered_from: "setup",
      });

      cy.findByLabelText(
        "Get infrequent emails about new releases and feature updates.",
      ).click();

      H.expectUnstructuredSnowplowEvent({
        event: "newsletter-toggle-clicked",
        triggered_from: "setup",
        event_detail: "opted-in",
      });

      cy.findByLabelText(
        "Get infrequent emails about new releases and feature updates.",
      ).click();

      H.expectUnstructuredSnowplowEvent({
        event: "newsletter-toggle-clicked",
        triggered_from: "setup",
        event_detail: "opted-out",
      });
    });
  });

  it("should ignore snowplow failures and work as normal", () => {
    H.blockSnowplow();
    cy.visit("/setup");
    skipWelcomePage();
    H.assertNoUnstructuredSnowplowEvent({
      event: "step_seen",
    });
  });
});

const skipWelcomePage = () => {
  cy.findByTestId("welcome-page").within(() => {
    cy.findByText("Welcome to Metabase");
    cy.findByText("Let's get started").click();
  });
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
  if (IS_ENTERPRISE) {
    cy.findByText("Activate your commercial license").should("exist");
    cy.button("I'll activate later").click();
  }
};

const finishSetup = () => {
  skipLicenseStepOnEE();
  cy.findByText("Finish").click();
};

const startAiConfigStep = () => {
  cy.findByText("You're all set up!").should("be.visible");
  cy.button("Set up AI").click();
  cy.findByLabelText("Connect to an AI provider").should("be.visible");
};

const typeToken = (token: string) => {
  // hides the requests from the logs as the token is passed as a GET param
  cy.intercept({ resourceType: "xhr" }, { log: false });
  cy.findByLabelText("Token")
    // hides the token from failure screenshots
    .invoke("attr", "type", "password")
    .type(token, { log: false });
};

// Navigate to the setup page, fills user data, password, skips usage questionnaire and proceeds to the database step
const navigateToDatabaseStep = () => {
  cy.visit(
    "/setup?first_name=John&last_name=Doe&email=john@doe.test&site_name=Doe%20Unlimited",
  );

  skipWelcomePage();

  cy.findByTestId("setup-forms").within(() => {
    const password = "12341234";
    cy.findByLabelText("Create a password").should("be.empty").type(password);
    cy.findByLabelText("Confirm your password").type(password);
    cy.button("Next").click();

    cy.log("Just go through the usage questionnaire");
    cy.findByLabelText("What will you use Metabase for?").should("be.visible");
    cy.button("Next").click();
  });

  cy.log("We are now on the database step");
};
