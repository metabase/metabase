import { restore } from "e2e/support/helpers";
import { WRITABLE_DB_ID, WRITABLE_DB_CONFIG } from "e2e/support/cypress_data";

import { visitDatabase } from "./helpers/e2e-database-helpers";

describe(
  "admin > database > external databases > enable actions",
  { tags: ["@external", "@actions"] },
  () => {
    ["mysql", "postgres"].forEach(dialect => {
      it(`should show ${dialect} writable_db with actions enabled`, () => {
        restore(`${dialect}-writable`);
        cy.signInAsAdmin();

        visitDatabase(WRITABLE_DB_ID).then(({ response: { body } }) => {
          expect(body.name).to.include("Writable");
          expect(body.name.toLowerCase()).to.include(dialect);

          expect(body.details.dbname).to.equal(
            WRITABLE_DB_CONFIG[dialect].connection.database,
          );
          expect(body.settings["database-enable-actions"]).to.eq(true);
        });

        cy.get("#model-actions-toggle").should(
          "have.attr",
          "aria-checked",
          "true",
        );
      });
    });
  },
);
