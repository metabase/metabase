import {
  restore,
  popover,
  describeEE,
  mockSessionProperty,
  isEE,
  typeAndBlurUsingLabel,
} from "e2e/support/helpers";

describe("scenarios > admin > databases > add", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show validation error if you enter invalid db connection info", () => {
    cy.intercept("POST", "/api/database").as("createDatabase");

    // should display a setup help card
    cy.visit("/admin/databases/create");
    cy.findByText("Need help connecting?");

    chooseDatabase("H2");
    typeAndBlurUsingLabel("Display name", "Test");
    typeAndBlurUsingLabel("Connection String", "invalid");

    cy.button("Save").click();
    cy.wait("@createDatabase");
    cy.findByText(": check your connection string");
    cy.findByText("Implicitly relative file paths are not allowed.");
  });

  it("should show error correctly on server error", () => {
    cy.intercept("POST", "/api/database", req => {
      req.reply({
        statusCode: 400,
        body: "DATABASE CONNECTION ERROR",
        delay: 1000,
      });
    }).as("createDatabase");

    cy.visit("/admin/databases/create");

    typeAndBlurUsingLabel("Display name", "Test");
    typeAndBlurUsingLabel("Database name", "db");
    typeAndBlurUsingLabel("Username", "admin");

    cy.button("Save").click();

    cy.wait("@createDatabase");
    cy.findByText("DATABASE CONNECTION ERROR").should("exist");
  });

  it("EE should ship with Oracle and Vertica as options", () => {
    cy.onlyOn(isEE);

    cy.visit("/admin/databases/create");
    cy.findByLabelText("Database type").click();
    popover().within(() => {
      cy.findByText("Oracle");
      cy.findByText("Vertica");
    });
  });

  describe("BigQuery", () => {
    it("should let you upload the service account json from a file", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("BigQuery");

      // enter text
      typeAndBlurUsingLabel("Display name", "bq db");
      // typeAndBlurUsingLabel("Dataset ID", "some-dataset");
      selectFieldOption("Datasets", "Only these...");
      cy.findByPlaceholderText("E.x. public,auth*").type("some-dataset");

      // create blob to act as selected file
      cy.get("input[type=file]")
        .then(async input => {
          const blob = await Cypress.Blob.binaryStringToBlob('{"foo": 123}');
          const file = new File([blob], "service-account.json");
          const dataTransfer = new DataTransfer();

          dataTransfer.items.add(file);
          input[0].files = dataTransfer.files;
          return input;
        })
        .trigger("change", { force: true })
        .trigger("blur", { force: true });

      cy.intercept("POST", "/api/database", req => {
        req.reply({
          statusCode: 200,
          body: { id: 123 },
          delay: 100,
        });
      }).as("createDatabase");

      // submit form and check that the file's body is included
      cy.button("Save").click();
      cy.wait("@createDatabase").should(xhr => {
        expect(xhr.request.body.details["service-account-json"]).to.equal(
          '{"foo": 123}',
        );
      });
    });
  });

  describe("Google Analytics ", () => {
    it("should let you upload the service account json from a file", () => {
      cy.visit("/admin/databases/create");
      chooseDatabase("Google Analytics");

      typeAndBlurUsingLabel("Display name", "google analytics");

      typeAndBlurUsingLabel("Google Analytics Account ID", " 999  ");

      // create blob to act as selected file
      cy.get("input[type=file]")
        .then(async input => {
          const blob = await Cypress.Blob.binaryStringToBlob('{"foo": 123}');
          const file = new File([blob], "service-account.json");
          const dataTransfer = new DataTransfer();

          dataTransfer.items.add(file);
          input[0].files = dataTransfer.files;
          return input;
        })
        .trigger("change", { force: true })
        .trigger("blur", { force: true });

      cy.intercept("POST", "/api/database", req => {
        req.reply({ statusCode: 200, body: { id: 123 }, delay: 100 });
      }).as("createDatabase");

      // submit form and check that the file's body is included
      cy.button("Save").click();
      cy.wait("@createDatabase").should(xhr => {
        expect(xhr.request.body.details["service-account-json"]).to.equal(
          '{"foo": 123}',
        );
      });
    });
  });

  describeEE("caching", () => {
    beforeEach(() => {
      mockSessionProperty("enable-query-caching", true);

      cy.intercept("POST", "/api/database", { id: 42 }).as("createDatabase");
      cy.visit("/admin/databases/create");

      typeAndBlurUsingLabel("Display name", "Test");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Database name", "db");
      typeAndBlurUsingLabel("Username", "admin");

      cy.findByText("Show advanced options").click();
    });

    it("sets cache ttl to null by default", () => {
      cy.button("Save").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.cache_ttl).to.equal(null);
      });
    });

    it("allows to set cache ttl", () => {
      cy.findByText("Use instance default (TTL)").click();
      popover().findByText("Custom").click();
      cy.findByDisplayValue("24").clear().type("48").blur();

      cy.button("Save").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.cache_ttl).to.equal(48);
      });
    });
  });

  it("should show the various Postgres SSL options correctly", () => {
    const confirmSSLFields = (visible, hidden) => {
      visible.forEach(field => cy.findByText(field));
      hidden.forEach(field => cy.findByText(field).should("not.exist"));
    };

    const ssl = "Use a secure connection (SSL)",
      sslMode = "SSL Mode",
      useClientCert = "Authenticate client certificate?",
      clientPemCert = "SSL Client Certificate (PEM)",
      clientPkcsCert = "SSL Client Key (PKCS-8/DER)",
      sslRootCert = "SSL Root Certificate (PEM)";

    cy.visit("/admin/databases/create");
    chooseDatabase("PostgreSQL");
    // initially, all SSL sub-properties should be hidden
    confirmSSLFields(
      [ssl],
      [sslMode, useClientCert, clientPemCert, clientPkcsCert, sslRootCert],
    );

    toggleFieldWithDisplayName(ssl);
    // when ssl is enabled, the mode and "enable client cert" options should be shown
    confirmSSLFields(
      [ssl, sslMode, useClientCert],
      [clientPemCert, clientPkcsCert, sslRootCert],
    );

    toggleFieldWithDisplayName(useClientCert);
    // when the "enable client cert" option is enabled, its sub-properties should be shown
    confirmSSLFields(
      [ssl, sslMode, useClientCert, clientPemCert, clientPkcsCert],
      [sslRootCert],
    );

    selectFieldOption(sslMode, "verify-ca");
    // when the ssl mode is set to "verify-ca", then the root cert option should be shown
    confirmSSLFields(
      [ssl, sslMode, useClientCert, clientPemCert, clientPkcsCert, sslRootCert],
      [],
    );
  });
});
function toggleFieldWithDisplayName(displayName) {
  cy.findByLabelText(displayName).click();
}

function selectFieldOption(fieldName, option) {
  cy.findByLabelText(fieldName).click();
  popover().contains(option).click({ force: true });
}

function chooseDatabase(database) {
  selectFieldOption("Database type", database);
}
