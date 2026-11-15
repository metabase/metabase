const { H } = cy;

describe("admin > MCP apps settings > Cursor install link", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("keeps the 'Install in Cursor' link above the switch track so it can be hovered and clicked without toggling the switch", () => {
    cy.visit("/admin/metabot/mcp");

    H.main().within(() => {
      cy.findByText("Show inline charts in these MCP clients").scrollIntoView();
      cy.findByRole("switch", { name: /cursor and vs code/i }).click({
        force: true,
      });

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

      cy.findByRole("link", { name: "Install in Cursor" })
        .then(($link) => {
          // Prevent the cursor:// deeplink from being followed during the test
          $link.on("click", (event) => event.preventDefault());
        })
        .click();

      cy.findByRole("switch", { name: /cursor and vs code/i }).should(
        "be.checked",
      );
    });
  });
});
