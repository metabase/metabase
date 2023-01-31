import { restore } from "__support__/e2e/helpers";

describe(
  "admin > database > external databases > enable actions",
  { tags: "@external" },
  () => {
    ["mysql", "postgres"].forEach(dialect => {
      it(`should show ${dialect} testing_db with actions enabled`, () => {
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();

        cy.request("/api/database/2").then(({ body }) => {
          expect(body.name).to.include("Writable");
          expect(body.name.toLowerCase()).to.include(dialect);

          expect(body.details.dbname).to.equal("testing_db");
          expect(body.settings["database-enable-actions"]).to.eq(true);
        });
      });
    });
  },
);
