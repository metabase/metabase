import { restore, typeAndBlurUsingLabel } from "__support__/e2e/helpers";
import {
  QA_MONGO_PORT,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
} from "__support__/e2e/cypress_data";

describe(
  "admin > database > add > external databases",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      cy.intercept("POST", "/api/database").as("createDatabase");

      cy.visit("/admin/databases/create");
      cy.contains("Database type").closest(".Form-field").find("a").click();
    });

    it("should add Postgres database and redirect to listing (metabase#12972, metabase#14334, metabase#17450)", () => {
      cy.contains("PostgreSQL").click({ force: true });

      cy.findByText("Show advanced options").click();

      // Reproduces (metabase#14334)
      cy.findByLabelText("Rerun queries for simple explorations").should(
        "have.attr",
        "aria-checked",
        "true",
      );
      cy.contains("Additional JDBC connection string options");
      // Reproduces (metabase#17450)
      cy.findByLabelText("Choose when syncs and scans happen")
        .click()
        .should("have.attr", "aria-checked", "true");

      isSyncOptionSelected("Never, I'll do this manually if I need to");

      // make sure fields needed to connect to the database are properly trimmed (metabase#12972)
      typeAndBlurUsingLabel("Display name", "QA Postgres12");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Port", QA_POSTGRES_PORT);
      typeAndBlurUsingLabel("Database name", "sample");
      typeAndBlurUsingLabel("Username", "metabase");
      typeAndBlurUsingLabel("Password", "metasample123");

      cy.button("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.details.host).to.equal("localhost");
        expect(request.body.details.dbname).to.equal("sample");
        expect(request.body.details.user).to.equal("metabase");
      });

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      cy.findByText("We're taking a look at your database!");
      cy.findByLabelText("close icon").click();

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });

      cy.findByRole("table").within(() => {
        cy.findByText("QA Postgres12").click();
      });

      cy.findByLabelText("Choose when syncs and scans happen").should(
        "have.attr",
        "aria-checked",
        "true",
      );

      isSyncOptionSelected("Never, I'll do this manually if I need to");
    });

    it("should add Mongo database and redirect to listing", () => {
      cy.contains("MongoDB").click({ force: true });
      cy.findByText("Show advanced options").click();
      cy.contains("Additional connection string options");

      typeAndBlurUsingLabel("Display name", "QA Mongo4");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Port", QA_MONGO_PORT);
      typeAndBlurUsingLabel("Database name", "sample");
      typeAndBlurUsingLabel("Username", "metabase");
      typeAndBlurUsingLabel("Password", "metasample123");
      typeAndBlurUsingLabel("Authentication database (optional)", "admin");

      cy.findByText("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase");

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      cy.findByRole("table").within(() => {
        cy.findByText("QA Mongo4");
      });

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });
    });

    it("should add Mongo database via the connection string", () => {
      const connectionString = `mongodb://metabase:metasample123@localhost:${QA_MONGO_PORT}/sample?authSource=admin`;

      cy.contains("MongoDB").click({ force: true });
      cy.findByText("Paste a connection string").click();
      typeAndBlurUsingLabel("Display name", "QA Mongo4");
      cy.findByLabelText("Port").should("not.exist");
      cy.findByLabelText("Paste your connection string").type(
        connectionString,
        { delay: 0 },
      );

      cy.findByText("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase");

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      cy.findByRole("table").within(() => {
        cy.findByText("QA Mongo4");
      });

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });
    });

    it("should add MySQL database and redirect to listing", () => {
      cy.contains("MySQL").click({ force: true });
      cy.findByText("Show advanced options").click();
      cy.contains("Additional JDBC connection string options");

      typeAndBlurUsingLabel("Display name", "QA MySQL8");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Port", QA_MYSQL_PORT);
      typeAndBlurUsingLabel("Database name", "sample");
      typeAndBlurUsingLabel("Username", "metabase");
      typeAndBlurUsingLabel("Password", "metasample123");

      // Bypass the RSA public key error for MySQL database
      // https://github.com/metabase/metabase/issues/12545
      typeAndBlurUsingLabel(
        "Additional JDBC connection string options",
        "allowPublicKeyRetrieval=true",
      );

      cy.findByText("Save").should("not.be.disabled").click();

      cy.wait("@createDatabase");

      cy.url().should("match", /\/admin\/databases\?created=true$/);

      cy.findByRole("table").within(() => {
        cy.findByText("QA MySQL8");
      });

      cy.findByRole("status").within(() => {
        cy.findByText("Syncing…");
        cy.findByText("Done!");
      });
    });
  },
);

function isSyncOptionSelected(option) {
  // This is a really bad way to assert that the text element is selected/active. Can it be fixed in the FE code?
  cy.findByText(option).parent().should("have.class", "text-brand");
}
