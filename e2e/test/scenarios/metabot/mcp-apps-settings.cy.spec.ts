const { H } = cy;

describe("admin > MCP apps settings > Cursor install link", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shows 'Install in Cursor' link only when the Cursor and VS Code switch is enabled", () => {
    cy.visit("/admin/metabot/mcp");

    H.main().within(() => {
      cy.findByText("Show inline charts in these MCP clients").scrollIntoView();

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

          expect(decoded.url).to.eq(
            `${Cypress.config("baseUrl")}/api/metabase-mcp`,
          );
        });

      cy.log(
        "link is hoverable — pointer events reach it (not the switch track)",
      );
      const hoverState = { mouseEntered: false };
      cy.findByRole("link", { name: "Install in Cursor" })
        .then(($link) => {
          $link[0].addEventListener("mouseenter", () => {
            hoverState.mouseEntered = true;
          });
        })
        .realHover()
        // If the switch track is covering the link, the pointer hits the track
        // and `mouseenter` never fires on the link.
        .should(() => {
          expect(hoverState.mouseEntered).to.be.true;
        });

      cy.log("clicking the link does not toggle the parent switch");
      cy.findByRole("link", { name: "Install in Cursor" })
        .then(($link) => {
          // Prevent the cursor:// deeplink from being followed during the test
          $link.on("click", (event) => event.preventDefault());
        })
        .click();

      cy.findByRole("switch", { name: /cursor and vs code/i }).should(
        "be.checked",
      );

      cy.log("disable Cursor and VS Code");
      cy.findByRole("switch", { name: /cursor and vs code/i }).click({
        force: true,
      });

      cy.log("link is hidden again");
      cy.findByRole("link", { name: "Install in Cursor" }).should("not.exist");
    });
  });
});
