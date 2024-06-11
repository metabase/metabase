import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  getIframeBody,
  modal,
  openStaticEmbeddingModal,
  popover,
  restore,
  visitDashboard,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Products",
  query: { "source-table": PRODUCTS_ID },
};

const filter3 = {
  name: "Text 2",
  slug: "text_2",
  id: "b0665b6a",
  type: "string/=",
  sectionId: "string",
};

const filter2 = {
  name: "Text 1",
  slug: "text_1",
  id: "d4c9f2e5",
  type: "string/=",
  sectionId: "string",
};

const filter = {
  filteringParameters: [filter2.id],
  name: "Text",
  slug: "text",
  id: "d1b69627",
  type: "string/=",
  sectionId: "string",
};

describe("dashboard preview", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );
    cy.intercept("GET", "/api/preview_embed/dashboard/**/params/**/values").as(
      "previewValues",
    );

    restore();
    cy.signInAsAdmin();
  });

  it("dashboard linked filters values don't work in static embed preview (metabase#37914)", () => {
    const dashboardDetails = {
      parameters: [filter, filter2, filter3],
      enable_embedding: true,
      embedding_params: {
        [filter.slug]: "enabled",
        [filter2.slug]: "enabled",
        [filter3.slug]: "enabled",
      },
    };
    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      addOrUpdateDashboardCard({
        dashboard_id,
        card_id,
        card: {
          parameter_mappings: [
            {
              card_id,
              parameter_id: filter.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter2.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter3.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      });

      visitDashboard(dashboard_id);
    });

    openStaticEmbeddingModal({
      activeTab: "parameters",
      previewMode: "preview",
    });

    modal().within(() => {
      // Makes it less likely to flake.
      cy.wait("@previewDashboard");

      getIframeBody().within(() => {
        cy.log(
          "Set filter 2 value, so filter 1 should be filtered by filter 2",
        );
        cy.button(filter2.name).click();
        cy.wait("@previewValues");
        popover().within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Doohickey").click();
          cy.button("Add filter").click();
        });

        cy.log("Assert filter 1");
        cy.button(filter.name).click();
        popover().within(() => {
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
          cy.findByText("Doohickey").should("be.visible");
        });
      });
    });
  });

  it("dashboard linked filters values in embed preview don't behave like embedding (metabase#41635)", () => {
    const dashboardDetails = {
      parameters: [filter, filter2, filter3],
      enable_embedding: true,
      embedding_params: {
        [filter.slug]: "enabled",
        [filter2.slug]: "locked",
        [filter3.slug]: "locked",
      },
    };
    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      addOrUpdateDashboardCard({
        dashboard_id,
        card_id,
        card: {
          parameter_mappings: [
            {
              card_id,
              parameter_id: filter.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter2.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
            {
              card_id,
              parameter_id: filter3.id,
              target: [
                "dimension",
                ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              ],
            },
          ],
        },
      });

      visitDashboard(dashboard_id);
    });

    openStaticEmbeddingModal({
      activeTab: "parameters",
      previewMode: "preview",
    });

    // Makes it less likely to flake.
    cy.wait("@previewDashboard");

    cy.log("Set the first locked parameter values");
    modal()
      .findByRole("generic", { name: "Previewing locked parameters" })
      .findByText("Text 1")
      .click();
    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    cy.log("Set the second locked parameter values");
    modal()
      .findByRole("generic", { name: "Previewing locked parameters" })
      .findByText("Text 2")
      .click();
    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.findByText("Gizmo").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    getIframeBody().within(() => {
      cy.log("Assert filter 1");
      cy.button(filter.name).click();
      popover().within(() => {
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
        cy.findByText("Doohickey").should("be.visible");
      });
    });
  });
});
