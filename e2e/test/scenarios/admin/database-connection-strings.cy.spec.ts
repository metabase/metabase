import { QA_MYSQL_PORT, QA_POSTGRES_PORT } from "e2e/support/cypress_data";

import { waitForDbSync } from "./helpers/e2e-database-helpers";

beforeEach(() => {
  cy.H.restore();
  cy.signInAsAdmin();
});

function selectFieldOption(fieldName: string, option: string) {
  cy.findByLabelText(fieldName).click();
  cy.H.popover().contains(option).click({ force: true });
}

function chooseDatabase(database: string) {
  selectFieldOption("Database type", database);
}

const databaseTestCases = [
  {
    engine: "Athena",
    connectionString: "jdbc:athena://WorkGroup=primary;Region=us-east-1;",
    expectedFields: [
      { label: "Region", value: "us-east-1" },
      { label: "Workgroup", value: "primary" },
    ],
  },
  {
    engine: "BigQuery",
    connectionString:
      "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=MyBigQueryProject;OAuthType=1;",
    expectedFields: [
      { label: "Project ID (override)", value: "MyBigQueryProject" },
      { label: "Display name", value: "MyBigQueryProject" },
    ],
  },
  {
    engine: "ClickHouse",
    connectionString:
      "jdbc:clickhouse://localhost:8443/testdb?ssl=true&user=testuser",
    expectedFields: [
      { label: "Host", value: "localhost" },
      { label: "Port", value: "8443" },
      { label: "Databases", value: "All" },
      { label: "Display name", value: "testdb" },
      { label: "Username", value: "testuser" },
      { label: "Additional JDBC connection string options", value: "ssl=true" },
      { label: "Use a secure connection (SSL)", value: "on", isChecked: true },
    ],
  },
  {
    engine: "Druid",
    connectionString:
      "jdbc:avatica:remote:url=http://localhost:8888/druid/v2/sql/avatica/;transparent_reconnection=true",
    expectedFields: [
      { label: "Host", value: "localhost" },
      { label: "Broker node port", value: "8888" },
    ],
  },
  {
    engine: "Databricks",
    connectionString:
      "jdbc:databricks://127.0.0.1:8123;httpPath=/sql/1.0/endpoints/abc;OAuthSecret=1234567890;OAuth2ClientId=xyz",
    expectedFields: [
      { label: "Host", value: "127.0.0.1" },
      { label: "HTTP Path", value: "/sql/1.0/endpoints/abc" },
      { label: "Service Principal OAuth Secret", value: "1234567890" },
      { label: "Service Principal Client ID", value: "xyz" },
    ],
  },
  {
    engine: "MySQL",
    connectionString:
      "jdbc:mysql://testuser:testpass@host:3306/dbname?ssl=true",
    expectedFields: [
      { label: "Host", value: "host" },
      { label: "Port", value: "3306" },
      { label: "Database name", value: "dbname" },
      { label: "Display name", value: "dbname" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
      { label: "Use a secure connection (SSL)", value: "on", isChecked: true },
    ],
  },
  {
    engine: "Oracle",
    connectionString:
      "jdbc:oracle:thin:testuser/testpass@mydbhost:1521/mydbservice?ssl_server_cert_dn=ServerDN",
    expectedFields: [
      { label: "Host", value: "mydbhost" },
      { label: "Port", value: "1521" },
      { label: "Oracle service name", value: "mydbservice" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
    ],
  },
  {
    engine: "PostgreSQL",
    connectionString: "jdbc:postgresql://testuser:testpass@localhost:5432/mydb",
    expectedFields: [
      { label: "Host", value: "localhost" },
      { label: "Port", value: "5432" },
      { label: "Database name", value: "mydb" },
      { label: "Display name", value: "mydb" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
    ],
  },
  {
    engine: "Presto",
    connectionString:
      "jdbc:presto://host:1234/sample-catalog/sample-schema?SSL=true&SSLTrustStorePassword=1234",
    expectedFields: [
      { label: "Host", value: "host" },
      { label: "Port", value: "1234" },
      { label: "Catalog", value: "sample-catalog" },
      { label: "Display name", value: "sample-catalog" },
      { label: "Schema (optional)", value: "sample-schema" },
      { label: "Use a secure connection (SSL)", value: "on", isChecked: true },
      { label: "Additional JDBC options", value: "SSLTrustStorePassword=1234" },
    ],
  },
  {
    engine: "Redshift",
    connectionString:
      "jdbc:redshift://examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com:5439/dev",
    expectedFields: [
      {
        label: "Host",
        value: "examplecluster.abc123xyz789.us-west-2.redshift.amazonaws.com",
      },
      { label: "Port", value: "5439" },
      { label: "Database name", value: "dev" },
      { label: "Display name", value: "dev" },
    ],
  },
  {
    engine: "Snowflake",
    connectionString:
      "snowflake://testuser:testpass@example.snowflakecomputing.com/?db=maindb&warehouse=mainwarehouse",
    expectedFields: [
      {
        label: "Account name",
        value: "example.snowflakecomputing.com",
      },
      { label: "Database name (case sensitive)", value: "maindb" },
      { label: "Display name", value: "maindb" },
      { label: "Warehouse", value: "mainwarehouse" },
      { label: "Username", value: "testuser" },
      { label: "Password", value: "testpass" },
    ],
  },
  {
    engine: "Spark SQL",
    connectionString: "jdbc:sparksql:Server=127.0.0.1;Port=10000",
    expectedFields: [{ label: "Host", value: "127.0.0.1" }],
  },
  {
    engine: "SQLite",
    connectionString: "jdbc:sqlite:///C:/path/to/database.db",
    expectedFields: [{ label: "Filename", value: "C:/path/to/database.db" }],
  },
  {
    engine: "SQL Server",
    connectionString:
      "jdbc:sqlserver://mydbhost:1433;databaseName=mydb;username=testuser;password=testpass",
    expectedFields: [
      { label: "Host", value: "mydbhost" },
      { label: "Port", value: "1433" },
      { label: "Database name", value: "mydb" },
    ],
  },
  {
    engine: "Starburst (Trino)",
    connectionString:
      "jdbc:trino://starburst.example.com:43011/hive/sales?user=test&password=secret&SSL=true&roles=system:myrole",
    expectedFields: [
      { label: "Host", value: "starburst.example.com" },
      { label: "Port", value: "43011" },
      { label: "Catalog", value: "hive" },
      { label: "Display name", value: "hive" },
      { label: "Schema (optional)", value: "sales" },
    ],
  },
  {
    engine: "Vertica",
    connectionString:
      "jdbc:vertica://vertica.example.com:1234/databaseName?user=jane",
    expectedFields: [
      { label: "Host", value: "vertica.example.com" },
      { label: "Port", value: "1234" },
      { label: "Database name", value: "databaseName" },
      { label: "Display name", value: "databaseName" },
      { label: "Username", value: "jane" },
    ],
  },
];

describe("Database connection strings", () => {
  it("should parse connection strings for all supported databases", () => {
    cy.visit("/admin/databases/create");

    databaseTestCases.forEach(
      ({ engine, connectionString, expectedFields }) => {
        chooseDatabase(engine);

        cy.findByLabelText("Connection string (optional)").paste(
          connectionString,
        );

        cy.findByText("Connection details pre-filled below.").should("exist");

        expectedFields.forEach(({ label, value, isChecked }) => {
          cy.findByLabelText(label).should("have.value", value);
          if (isChecked) {
            cy.findByLabelText(label).should("be.checked");
          }
        });
      },
    );
  });

  it("should enable the 'Save' button when the connection string is valid", () => {
    cy.visit("/admin/databases/create");

    chooseDatabase("MySQL");

    cy.findByLabelText("Connection string (optional)").paste(
      "jdbc:mysql://testuser:testpass@host:3306/dbname?ssl=true",
    );

    cy.button("Save").should("be.enabled");
  });

  it("should show a warning if the connection string is invalid", () => {
    cy.visit("/admin/databases/create");

    chooseDatabase("MySQL");

    cy.findByLabelText("Connection string (optional)").paste("invalid");

    cy.findByTextEnsureVisible("Couldn’t use this connection string.");
  });

  it("should not clear the existing values", () => {
    cy.visit("/admin/databases/create");

    chooseDatabase("PostgreSQL");
    cy.findByLabelText("Port").type("1111");

    cy.findByLabelText("Connection string (optional)").paste(
      "postgresql://postgres:password@db.apbkobhfnmcqqzqeeqss.supabase.co/postgres",
    );

    cy.findByLabelText("Port").should("have.value", "1111");
    cy.findByLabelText("Database type").should("have.value", "PostgreSQL");
  });

  describe("actual database connections", { tags: "@external" }, () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/database").as("createDatabase");
      cy.intercept("GET", "/api/database").as("getDatabases");
    });

    it("should successfully connect to MySQL using connection string", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("MySQL");

      const connectionString = `jdbc:mysql://metabase:metasample123@localhost:${QA_MYSQL_PORT}/sample?allowPublicKeyRetrieval=true`;

      cy.findByLabelText("Connection string (optional)").paste(
        connectionString,
      );

      cy.findByLabelText("Host").should("have.value", "localhost");
      cy.findByLabelText("Port").should("have.value", QA_MYSQL_PORT.toString());
      cy.findByLabelText("Database name").should("have.value", "sample");
      cy.findByLabelText("Username").should("have.value", "metabase");
      cy.findByLabelText("Password").should("have.value", "metasample123");

      cy.button("Save").should("be.enabled").click();

      cy.wait("@createDatabase").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("sample");
      });

      cy.url().should("match", /\/admin\/databases\/\d/);
      waitForDbSync();

      cy.findByRole("link", { name: "Manage permissions" }).should(
        "be.visible",
      );
      cy.findByRole("link", { name: /Browse data/ }).should("be.visible");
    });

    it("should successfully connect to PostgreSQL using connection string", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("PostgreSQL");

      const connectionString = `jdbc:postgresql://metabase:metasample123@localhost:${QA_POSTGRES_PORT}/sample`;

      cy.findByLabelText("Connection string (optional)").paste(
        connectionString,
      );

      cy.findByTextEnsureVisible("Connection details pre-filled below.").should(
        "exist",
      );

      cy.findByLabelText("Host").should("have.value", "localhost");
      cy.findByLabelText("Port").should(
        "have.value",
        QA_POSTGRES_PORT.toString(),
      );
      cy.findByLabelText("Database name").should("have.value", "sample");
      cy.findByLabelText("Username").should("have.value", "metabase");
      cy.findByLabelText("Password").should("have.value", "metasample123");

      cy.button("Save").should("be.enabled").click();

      cy.wait("@createDatabase").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("sample");
      });

      cy.url().should("match", /\/admin\/databases\/\d/);
      waitForDbSync();

      cy.findByRole("link", { name: "Manage permissions" }).should(
        "be.visible",
      );
      cy.findByRole("link", { name: /Browse data/ }).should("be.visible");
    });

    it("should handle connection failures gracefully", () => {
      cy.visit("/admin/databases/create");

      chooseDatabase("PostgreSQL");

      const invalidConnectionString = `jdbc:postgresql://baduser:wrongpass@localhost:${QA_POSTGRES_PORT}/nonexistent`;

      cy.findByLabelText("Connection string (optional)").paste(
        invalidConnectionString,
      );

      cy.button("Save").should("be.enabled").click();

      cy.wait("@createDatabase").then(({ response }) => {
        expect(response?.statusCode).to.not.equal(200);
      });

      cy.button("Failed").should("exist");
    });
  });
});
