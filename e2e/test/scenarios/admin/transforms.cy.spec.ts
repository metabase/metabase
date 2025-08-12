import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should be able to create and run a transform", () => {
    cy.visit("/admin/transforms");
  });
});
