const { H } = cy;

describe("admin > database > database routing", { tags: ["@external"] }, () => {
  before(() => {
    H.queryWritableDB(
      "SELECT datname from pg_database WHERE datname = 'postgres_two'",
    ).then((res: { rows: any[] }) => {
      if (res.rows.length === 0) {
        H.queryWritableDB("CREATE DATABASE postgres_two IF NOT EXISTS;");
      }
    });

    H.queryWritableDB(
      "SELECT datname from pg_database WHERE datname = 'postgres_three'",
    ).then((res) => {
      if (res.rows.length === 0) {
        H.queryWritableDB("CREATE DATABASE postgres_three IF NOT EXISTS;");
      }
    });

    // probably add a table or two here

    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.addPostgresDatabase("Postgres Two", false, "postgres_two;");
    H.addPostgresDatabase("Postgres Three", false, "postgres_three;");
    H.snapshot("db-routing-3-dbs");
  });

  beforeEach(() => {
    H.restore("db-routing-3-dbs" as any);
    cy.signInAsAdmin();
  });

  it("should connect multiple DBs", () => {
    cy.visit("/admin/databases");
    cy.findByTestId("database-list").within(() => {
      cy.findByText("Postgres Two");
      cy.findByText("Postgres Three");
    });
  });
});
