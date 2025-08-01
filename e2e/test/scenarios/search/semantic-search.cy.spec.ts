const { H } = cy;

const semanticSearch = () => cy.findByTestId("search-engine-setting");
const semanticSearchInput = () => semanticSearch().findByRole("switch");

describe("scenarios > search > semantic search", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("settings", () => {
    it("should not show setting to self-hosted customers", () => {
      H.activateToken("pro-self-hosted");
      cy.visit("/admin/settings");
      cy.findByTestId("site-url-setting").should("exist");
      cy.findByTestId("search-engine-setting").should("not.exist");
    });

    it("should upsell hosted starter customers", () => {
      H.mockSessionProperty("is-hosted?", true);
      H.activateToken("starter"); // TODO still "pro-self-hosted" somehow...
      cy.visit("/admin/settings");

      cy.findByTestId("search-engine-setting").within(() => {
        cy.findByText("Get this with Pro. Try for free.");
      });
    });

    it("should be able to enable/disable the setting", () => {
      H.mockSessionProperty("is-hosted?", true);
      H.activateToken("pro-cloud"); // still "pro-self-hosted" somehow...
      cy.visit("/admin/settings");

      cy.intercept("PUT", "/api/setting/search-engine").as("search-engine");

      semanticSearchInput().should("not.be.checked");
      semanticSearch()
        .contains(/Advanced semantic search/)
        .click();

      cy.wait("@search-engine").should(({ response }) => {
        expect(response?.statusCode).to.eq(204);
      });
      semanticSearchInput().should("be.checked");

      semanticSearch()
        .contains(/Advanced semantic search/)
        .click();

      cy.wait("@search-engine").should(({ response }) => {
        expect(response?.statusCode).to.eq(204);
      });
      semanticSearchInput().should("not.be.checked");
    });
  });
});
