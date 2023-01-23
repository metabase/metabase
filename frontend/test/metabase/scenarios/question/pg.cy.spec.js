import { restore } from "__support__/e2e/helpers";

/**
 * We're using the existing QA Postgres database for the sake of simplicity.
 * Nothing's stopping us from spinning up empty Postgres container, either.
 */
const connectionConfig = {
  user: "metabase",
  password: "metasample123",
  host: "localhost",
  database: "sample",
  ssl: false,
  port: 5432,
};

const query = `
SELECT 'Hello from Postgres!' as greeting;
`;

describe("PoC - Cypress directly connecting to a Postgres database", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should connect and query Postgres database", () => {
    cy.task("connectAndQueryDB", {
      connectionConfig,
      query,
    }).then(({ rows }) => {
      const result = rows[0];
      expect(result).to.deep.equal({ greeting: "Hello from Postgres!" });
    });
  });
});
