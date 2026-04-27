const { H } = cy;

describe("admin > MCP apps settings > Cursor install link", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows 'Install in Cursor' link only when the Cursor and VS Code switch is enabled", () => {
    cy.visit("/admin/metabot");

    H.main().within(() => {
      cy.findByText("Supported MCP clients").scrollIntoView();

      cy.log("link is hidden by default");
      cy.findByRole("link", { name: "Install in Cursor" }).should("not.exist");

      cy.log("enable Cursor and VS Code");
      cy.findByRole("switch", { name: /cursor and vs code/i }).click({
        force: true,
      });

      cy.log("link appears with a valid Cursor deeplink");
      cy.findByRole("link", { name: "Install in Cursor" })
        .should("be.visible")
        .invoke("attr", "href")
        .should((href) => {
          expect(href).to.be.a("string");
          expect(href).to.match(
            /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?/,
          );

          const query = (href as string).split("?", 2)[1];
          const params = new URLSearchParams(query);

          expect(params.get("name")).to.eq("Metabase");
          const config = params.get("config");

          expect(config).to.be.a("string");

          const decoded = JSON.parse(atob(config as string));

          expect(decoded.url).to.eq(`${Cypress.config("baseUrl")}/api/mcp`);
        });

      cy.log("disable Cursor and VS Code");
      cy.findByRole("switch", { name: /cursor and vs code/i }).click({
        force: true,
      });

      cy.log("link is hidden again");
      cy.findByRole("link", { name: "Install in Cursor" }).should("not.exist");
    });
  });
});
