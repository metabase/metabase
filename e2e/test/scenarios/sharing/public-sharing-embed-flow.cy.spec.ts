import type { Interception } from "cypress/types/net-stubbing";

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { CardId, DashboardId, Parameter } from "metabase-types/api";

import { getEmbedSidebar } from "../embedding/sdk-iframe-embedding-setup/helpers";

const { H } = cy;

type Resource = "dashboard" | "question";

// The menu, popover, modal and embed flow UI, and the Snowplow events they
// send, are covered by Jest tests. These tests check the real backend (the
// writes, what it stores and what it sends back) and the real browser (the
// embed preview iframe and CSS hit testing).

describe("scenarios > sharing > public link", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("enable-public-sharing", true);
  });

  it("should save a new question, then create and remove its public link (metabase#39152)", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", "Sample Database", "People"] });
    H.visualize();

    H.openSharingMenu();

    H.modal().within(() => {
      cy.findByText("First, save your question").should("be.visible");
      cy.findByText("Save").click();
    });

    H.openSharingMenu("Create a public link");
    assertValidPublicLink().as("publicLink");

    cy.log("the backend stores the public link");
    cy.reload();
    H.openSharingMenu("Public link");
    cy.get<string>("@publicLink").then((publicLink) => {
      assertValidPublicLink().should("eq", publicLink);
    });

    cy.intercept("DELETE", "/api/card/*/public_link").as("removePublicLink");
    H.popover().button("Remove public link").click();
    cy.wait("@removePublicLink");

    cy.log("the backend removes the public link");
    cy.reload();
    H.openSharingMenu();
    H.sharingMenu().within(() => {
      cy.findByText("Create a public link").should("be.visible");
      cy.findByText("Public link").should("not.exist");
    });
  });
});

[
  { resource: "dashboard" as const, apiPath: "dashboard" as const },
  { resource: "question" as const, apiPath: "card" as const },
].forEach(({ resource, apiPath }) => {
  describe(`scenarios > sharing > static embedding of a ${resource}`, () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.enableTracking();

      createResource(resource).then((id) => {
        cy.wrap(id).as("resourceId");
      });
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should publish and unpublish a static embed", () => {
      cy.get<CardId | DashboardId>("@resourceId").then((id) => {
        visitResource(resource, id);
        H.openLegacyStaticEmbeddingModal({
          resource,
          resourceId: id,
          activeTab: "parameters",
        });
      });

      H.modal().findByLabelText("Price").click();
      H.selectDropdown().findByText("Editable").click();

      H.publishChanges(apiPath, ({ request, response }: Interception) => {
        expect(request.body.embedding_type).to.equal("static-legacy");
        expect(response?.body.embedding_type).to.equal("static-legacy");
        expect(response?.body.embedding_params).to.deep.equal({
          created_at: "disabled",
          price: "enabled",
          category: "disabled",
        });
      });

      // `new_embed` comes from the `initially_published_at` that the backend
      // set when the modal helper published the embed first.
      H.expectUnstructuredSnowplowEvent({
        event: "static_embed_published",
        artifact: resource,
        new_embed: false,
        params: { disabled: 2, locked: 0, enabled: 1 },
      });

      cy.log("the backend stores the published embed");
      cy.get<CardId | DashboardId>("@resourceId").then((id) => {
        visitResource(resource, id);
      });
      // Reopen through the app only, so that nothing writes the embed again
      H.openSharingMenu("Embed");
      H.embedModalContent().within(() => {
        H.legacyStaticEmbeddingButton().click();
      });

      H.modal().within(() => {
        cy.findByText(
          `This ${resource} is published and ready to be embedded.`,
        ).should("be.visible");
        cy.findByRole("tab", { name: "Parameters" }).click();
        cy.findByLabelText("Price").should("have.value", "Editable");
      });

      H.unpublishChanges(apiPath, ({ request, response }: Interception) => {
        expect(request.body.embedding_type).to.equal(null);
        expect(response?.body.embedding_type).to.equal(null);
      });

      cy.log("the backend stores the unpublished embed");
      cy.get<CardId | DashboardId>("@resourceId").then((id) => {
        cy.request("GET", `/api/${apiPath}/${id}`).then(({ body }) => {
          expect(body.enable_embedding).to.equal(false);
          expect(body.embedding_type).to.equal(null);
          expect(body.embedding_params).to.deep.equal({
            created_at: "disabled",
            price: "enabled",
            category: "disabled",
          });
        });
      });
    });
  });
});

describe("scenarios > sharing > embed flow pre-selection", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.enableTracking();
    H.updateSetting("enable-embedding-modular", true);
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("pre-selects dashboard in embed flow when opened from dashboard sharing modal", () => {
    // Terms not accepted yet, so the option cards start out dimmed and not
    // interactive (EMB-1884). Jest cannot check `pointer-events`.
    H.updateSetting("show-modular-embed-terms", true);
    H.updateSetting("enable-embedding-modular", false);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.openSharingMenu("Embed");

    getEmbedSidebar().findByLabelText("Guest").click();
    optionCardsWrapper().should("have.css", "pointer-events", "none");

    H.embedModalEnableEmbedding();
    optionCardsWrapper().should("have.css", "pointer-events", "all");

    H.expectUnstructuredSnowplowEvent({ event: "embed_wizard_opened" });

    getEmbedSidebar().within(() => {
      cy.findByText("Behavior").should("be.visible");
      cy.findByText("Appearance").should("be.visible");
    });

    H.waitForSimpleEmbedIframesToLoad();

    H.getSimpleEmbedIframeContent()
      .findByText("Orders in a dashboard", { timeout: 10_000 })
      .should("be.visible");

    getEmbedSidebar().findByText("Back").should("not.exist");
    getEmbedSidebar().findByText("Get code").click();

    H.expectUnstructuredSnowplowEvent({
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });
});

// The Behavior/Parameters/Appearance cards share a wrapper that is dimmed and
// made non-interactive while the selected auth type isn't ready. The wrapper
// always carries an inline `opacity` style, so it can be selected in either state.
const optionCardsWrapper = () =>
  getEmbedSidebar().findByText("Behavior").closest("[style*='opacity']");

function assertValidPublicLink() {
  const publicLinkPattern =
    /^https?:\/\/[^/]+\/public\/question\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  cy.findByTestId("public-link-popover-content").within(() => {
    cy.findByText("Public link").should("be.visible");
    cy.findByText("Remove public link").should("be.visible");
  });

  return cy
    .findByTestId("public-link-input")
    .should("be.visible")
    .invoke("val")
    .should("match", publicLinkPattern);
}

const PARAMETERS: Parameter[] = [
  { id: "1", name: "Created At", slug: "created_at", type: "date/month-year" },
  { id: "2", name: "Price", slug: "price", type: "number/=" },
  { id: "3", name: "Category", slug: "category", type: "string/contains" },
];

function createResource(
  resource: Resource,
): Cypress.Chainable<CardId | DashboardId> {
  if (resource === "question") {
    return H.createNativeQuestion({
      name: "Question",
      native: {
        query: `
          SELECT *
          FROM PRODUCTS
          WHERE true
            [[AND created_at > {{created_at}}]]
            [[AND price > {{price}}]]
            [[AND category = {{category}}]]`,
        "template-tags": {
          created_at: {
            type: "date",
            name: "created_at",
            id: "b2517f32-d2e2-4f42-ab79-c91e07e820a0",
            "display-name": "Created At",
          },
          price: {
            type: "number",
            name: "price",
            id: "879d1597-e673-414c-a96f-ff5887359834",
            "display-name": "Price",
          },
          category: {
            type: "text",
            name: "category",
            id: "1f741a9a-a95e-4ac6-b584-5101e7cf77e1",
            "display-name": "Category",
          },
        },
      },
    }).then(({ body }): CardId | DashboardId => body.id);
  }

  return H.createDashboard({
    name: "Dashboard",
    parameters: PARAMETERS,
  }).then(({ body }): CardId | DashboardId => body.id);
}

function visitResource(resource: Resource, id: CardId | DashboardId) {
  if (resource === "question") {
    H.visitQuestion(id);
  } else {
    H.visitDashboard(id);
  }
}
