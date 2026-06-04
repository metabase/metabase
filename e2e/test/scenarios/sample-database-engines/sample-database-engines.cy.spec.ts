const { H } = cy;
import { H2_SAMPLE_DB_ID, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { H2_SAMPLE_DATABASE } from "e2e/support/cypress_sample_database_h2";

const { ORDERS_ID } = H2_SAMPLE_DATABASE;

/**
 * Proves the default snapshot ships both sample-data engines as separate databases, and that a test
 * can target either. SQLite (id 1) is the canonical Sample Database used by default everywhere; the
 * H2-backed copy (id 9001) is opt-in for tests coupled to H2-specific behavior.
 */
describe("scenarios > sample database engines", () => {
  beforeEach(() => {
    H.restore("default-with-h2");
    cy.signInAsAdmin();
  });

  it("ships the SQLite Sample Database (default) and an H2 copy as separate databases", () => {
    cy.request(`/api/database/${SAMPLE_DB_ID}`).then(({ body }) => {
      expect(body.engine).to.eq("sqlite");
      expect(body.is_sample).to.eq(true);
    });

    cy.request(`/api/database/${H2_SAMPLE_DB_ID}`).then(({ body }) => {
      expect(body.engine).to.eq("h2");
      // it's a normal database, not flagged is_sample, to keep single-sample-DB
      // backend lookups deterministic
      expect(body.is_sample).to.eq(false);
    });
  });

  it("duplicates the example content against the H2 copy", () => {
    cy.request("/api/collection").then(({ body: collections }) => {
      const exampleH2 = collections.find(
        (c: { name: string }) => c.name === "Example (H2)",
      );
      expect(exampleH2, "Example (H2) collection").to.exist;
    });
  });

  it("can run a query against the H2 sample database", () => {
    H.createQuestion(
      {
        name: "H2 orders count",
        database: H2_SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("scalar-value").should("be.visible");
  });
});
