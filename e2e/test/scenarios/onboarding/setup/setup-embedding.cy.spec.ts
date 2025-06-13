const { H } = cy;

describe("scenarios > setup embedding (EMB-477)", () => {
  beforeEach(() => H.restore("blank"));

  it("should allow users to use existing setup flow", () => {
    cy.visit("/setup/embedding");
    assertEmbeddingOnboardingPageLoaded();

    cy.findByRole("link", { name: "Set up manually" })
      .should("be.visible")
      .click();

    cy.findAllByRole("main")
      .eq(1)
      .within(() => {
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

  it("should allow users to go through the embedding setup and onboarding flow", () => {
    cy.visit("/setup/embedding");

    cy.log("0: Welcome step");
    assertEmbeddingOnboardingPageLoaded();
    step().within(() => {
      cy.findByRole("heading", {
        name: "Let's get you up and running with a starting setup for embedded analytics",
      }).should("be.visible");
      cy.button("Start").should("be.visible").click();
    });

    cy.log("1: User creation step");
    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Create User",
      );
    });
    step().within(() => {
      cy.findByRole("heading", { name: "What should we call you?" }).should(
        "be.visible",
      );

      fillOutUserForm();

      cy.button("Next").should("be.enabled").click();
    });

    cy.log("2: Data connection step");
    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Connect Data",
      );
    });
    step().within(() => {
      cy.findByRole("heading", { name: "Connect to your data" }).should(
        "be.visible",
      );

      cy.findByRole("option", { name: "PostgreSQL" }).click();
      fillOutDatabaseForm();

      cy.button("Connect database").should("be.enabled").click();
    });

    cy.log("3: Content generation step");
    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Select Tables",
      );
    });

    step()
      .findByRole("heading", { name: "Select Tables to Embed" })
      .should("be.visible");

    cy.log("Ensure the database sync status is not shown");
    cy.findByRole("status").should("not.exist");

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
      cy.log(
        "Others non-selected options should be disabled after selecting 3 options (max limit)",
      );
      cy.findByRole("checkbox", { name: "reviews" }).should("be.disabled");
      cy.button("Continue").should("be.enabled").click();
    });

    cy.log("4: Embed in your app step");
    step()
      .findByRole("heading", { name: "Add to your app" })
      .should("be.visible");

    sidebar().within(() => {
      cy.findByRole("listitem", { current: "step" }).should(
        "have.text",
        "Final Steps",
      );
    });

    step().within(() => {
      cy.findByRole("tab", { name: 'A look at "Feedback"' }).click();
      H.getIframeBody().within(() => {
        cy.findByText('A look at "Feedback"').should("be.visible");
      });
      cy.findByRole("code").contains(
        new RegExp(
          '<iframe src="http://localhost:4000/dashboard/\\d+" width="800px" height="500px" />',
        ),
      );

      cy.findByRole("tab", { name: 'A look at "Orders"' }).click();
      /**
       * There's a problem when changing tabs, sometimes Cypress seems to still get the old iframe body.
       * So, it's be much more stable to wait for a brief moment before trying to get the new iframe body.
       */
      cy.wait(100);
      H.getIframeBody().within(() => {
        cy.findByText('A look at "Orders"').should("be.visible");
      });
      cy.findByRole("code").contains(
        new RegExp(
          '<iframe src="http://localhost:4000/dashboard/\\d+" width="800px" height="500px" />',
        ),
      );

      cy.findByRole("tab", { name: 'A look at "Products"' }).click();
      cy.wait(100);
      H.getIframeBody().within(() => {
        cy.findByText('A look at "Products"').should("be.visible");
      });
      cy.findByRole("code").contains(
        new RegExp(
          '<iframe src="http://localhost:4000/dashboard/\\d+" width="800px" height="500px" />',
        ),
      );

      cy.findByRole("tab", { name: "Query Builder" }).click();
      cy.wait(100);
      H.getIframeBody().within(() => {
        cy.findByText("Pick your starting data").should("be.visible");
      });
      cy.findByRole("code").contains(
        new RegExp(
          '<iframe src="http://localhost:4000/question/new" width="800px" height="500px" />',
        ),
      );

      cy.button("I see Metabase").click();

      cy.findByRole("heading", { name: "You're on your way!" }).should(
        "be.visible",
      );
      cy.button("Take me to Metabase").click();
    });

    cy.log("5: Metabase");
    cy.button("New").should("be.visible");
  });
});

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

function fillOutUserForm() {
  cy.findByLabelText("First name").type("Testy");
  cy.findByLabelText("Last name").type("McTestface");
  cy.findByLabelText("Email").type("testy@metabase.test");
  cy.findByLabelText("Company or team name").type("Epic Team");

  cy.findByLabelText("Create a password").type("metabase123");
  cy.findByLabelText("Confirm your password").type("metabase123");
}

function fillOutDatabaseForm() {
  cy.findByLabelText("Display name").type("Postgres Database");
  cy.findByLabelText("Host").type("localhost");
  cy.findByLabelText("Port").type("5404");
  cy.findByLabelText("Database name").type("sample");
  cy.findByLabelText("Username").type("metabase");
  cy.findByLabelText("Password").type("metasample123");
}
