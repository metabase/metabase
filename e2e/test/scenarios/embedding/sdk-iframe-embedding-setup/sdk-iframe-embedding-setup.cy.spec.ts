const { H } = cy;

describe("scenarios > embedding", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
  });

  it("can setup an embed", () => {
    cy.visit("/embed/new");
  });
});
