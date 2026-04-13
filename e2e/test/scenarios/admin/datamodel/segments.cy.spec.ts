const { H } = cy;

describe("scenarios > admin > datamodel > segments (redirects)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should redirect /admin/datamodel/segments to /data-studio/data", () => {
    cy.visit("/admin/datamodel/segments");
    cy.location("pathname").should("eq", "/data-studio/data");
  });

  it("should redirect /admin/datamodel/segment/create to /data-studio/data", () => {
    cy.visit("/admin/datamodel/segment/create");
    cy.location("pathname").should("eq", "/data-studio/data");
  });

  it("should redirect /admin/datamodel/segment/:id to /data-studio/data", () => {
    cy.visit("/admin/datamodel/segment/1");
    cy.location("pathname").should("eq", "/data-studio/data");
  });

  it("should redirect /admin/datamodel/segment/:id/revisions to /data-studio/data", () => {
    cy.visit("/admin/datamodel/segment/1/revisions");
    cy.location("pathname").should("eq", "/data-studio/data");
  });
});
