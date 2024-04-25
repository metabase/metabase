import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addOrUpdateDashboardCard,
  dashboardHeader,
  getIframeBody,
  modal,
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

const dashboardDetails = {
  parameters: [filter, filter2, filter3],
  enable_embedding: true,
  embedding_params: {
    [filter.slug]: "enabled",
    [filter2.slug]: "enabled",
    [filter3.slug]: "enabled",
  },
};

describe("issue 37914", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );
    cy.intercept("GET", "/api/dashboard/**/params/**/values").as("values");

    restore();
    cy.signInAsAdmin();

    cy.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
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
  });

  it("dashboard linked filters values doesn't work in static embed preview (metabase#37914)", () => {
    dashboardHeader().within(() => {
      cy.icon("share").click();
    });

    popover().findByText("Embed").click();

    modal().within(() => {
      cy.findByText("Static embed").click();

      cy.button("Agree and continue").click();

      cy.findByRole("tab", { name: "Parameters" }).click();

      cy.findByText("Preview").click();

      // Makes it less likely to flake.
      cy.wait("@previewDashboard");

      getIframeBody().within(() => {
        cy.log(
          "Set filter 2 value, so filter 1 should be filtered by filter 2",
        );
        cy.button(filter2.name).click();
        cy.wait("@values");
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
});
