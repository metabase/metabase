const { H } = cy;

/**
 * The embedding hub's Get started tab at `/embedding/get-started`.
 *
 * Deliberately thin: card copy, the upsell banner and the AI card's done states
 * are unit-tested next to their components. What is here is what needs a real
 * browser or a real backend -- routing, the two step orderings, and completion
 * coming back from the checklist endpoint.
 *
 * Both blocks are `@EE`. The unlicensed case is an EE build with no token
 * activated, not an OSS build: the checklist is served from `/api/ee/...`, so on
 * an OSS build the route would not exist at all and every step would read as
 * incomplete for a reason this page is not responsible for.
 */

const CARD = "embedding-hub-checklist-card";

const PRO_STEP_ORDER = [
  "Connect a database",
  "Create a dashboard",
  "Get embed snippet",
  "Configure data permissions and tenants",
  "Set up SSO",
  "Embed in production with SSO",
  "Create a custom theme",
  "Configure AI",
];

// Without modular embedding every Fine-tune step is locked, so AI -- the one
// advanced step still reachable -- is promoted into the first section.
const UNLICENSED_STEP_ORDER = [
  "Connect a database",
  "Create a dashboard",
  "Get embed snippet",
  "Configure AI",
  "Configure data permissions and tenants",
  "Set up SSO",
  "Embed in production with SSO",
  "Create a custom theme",
];

function assertStepOrder(titles: string[]) {
  cy.findAllByTestId(CARD)
    .should("have.length", titles.length)
    .each(($card, index) => {
      cy.wrap($card).should("contain.text", titles[index]);
    });
}

describe("scenarios > embedding > embedding hub > get started", () => {
  describe("pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("redirects from the hub root and lists the licensed step order", () => {
      cy.visit("/embedding");

      cy.log("the hub root is the Get started tab");
      cy.location("pathname").should("eq", "/embedding/get-started");

      cy.findByRole("link", { name: "Get started" }).should(
        "have.attr",
        "aria-current",
        "page",
      );

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByRole("heading", {
          name: "Get started with Metabase Embedding",
        }).should("be.visible");

        assertStepOrder(PRO_STEP_ORDER);
      });
    });

    it("returns to Get started from the permissions wizard", () => {
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main")
        .findByRole("link", { name: "Configure data permissions and tenants" })
        .click();

      cy.location("pathname").should(
        "eq",
        "/embedding/get-started/permissions-setup",
      );

      cy.log(
        "the wizard's back link is relative, so it lands on the host that mounted it rather than admin",
      );
      cy.findByRole("link", { name: /Back to the setup guide/ }).click();

      cy.location("pathname").should("eq", "/embedding/get-started");
    });
  });

  describe("unlicensed", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("promotes AI into the first section and locks the Fine-tune steps", () => {
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main").within(() => {
        assertStepOrder(UNLICENSED_STEP_ORDER);

        cy.log(
          "the upsell banner is what stands in for the Fine-tune subtitle",
        );
        cy.findByText(
          "Upgrade to Metabase Pro to configure advanced options.",
        ).should("be.visible");

        cy.log("a feature-locked step is inert, with no link to follow");
        cy.findByRole("link", { name: "Set up SSO" }).should("not.exist");
        cy.findByText("Set up SSO")
          .closest(`[data-testid=${CARD}]`)
          .should("have.attr", "aria-disabled", "true");

        cy.log("AI is never locked -- the admin AI page needs no token");
        cy.findByRole("button", { name: "Configure AI" }).should("be.visible");
      });
    });

    it("marks the embed step complete once a guest embed is published", () => {
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByText("Get embed snippet")
          .closest(`[data-testid=${CARD}]`)
          .findByLabelText("Step 3 complete")
          .should("not.exist");
      });

      cy.log("publish a dashboard as a guest embed");
      H.createDashboard({ name: "Published dashboard" }).then(
        ({ body: dashboard }) => {
          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            enable_embedding: true,
          });
        },
      );

      cy.log(
        "the checklist is served without a licence, so completion is real rather than all-false",
      );
      cy.visit("/embedding/get-started");

      cy.findByTestId("embedding-hub-main").within(() => {
        cy.findByText("Get embed snippet")
          .closest(`[data-testid=${CARD}]`)
          .findByLabelText("Step 3 complete")
          .should("exist");
      });
    });
  });
});
