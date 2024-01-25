import {
  restore,
  popover,
  visitDashboard,
  addOrUpdateDashboardCard,
  dashboardHeader,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    cy.intercept("GET", "/api/embed/dashboard/**").as("getEmbed");

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

    cy.get(".Modal--full").within(() => {
      cy.findByText("Embed in your application").click();

      // This is super nasty. I'm fixing the problem where the preview iframe got rerendered multiple times.
      // This only happens in 48, but in master (v49), there won't be this problem because we memoize the iframe URL.
      // In 48, however, it a bit tricky to do that since the component is a class component. So I couldn't use `useMemo`,
      // and I don't want to change a ton of code to make this work either.
      cy.wait("@getEmbed");
      cy.wait("@getEmbed");
      cy.wait("@getEmbed");
      cy.wait("@getEmbed");
      cy.wait("@getEmbed");
      cy.wait("@getEmbed");

      getIframeBody().within(() => {
        cy.log(
          "Set filter 2 value, so filter 1 should be filtered by filter 2",
        );
        cy.button(filter2.name).click();
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

// Code grabbed from https://www.cypress.io/blog/2020/02/12/working-with-iframes-in-cypress
const getIframeDocument = () => {
  return (
    cy
      .get("iframe")
      // Cypress yields jQuery element, which has the real
      // DOM element under property "0".
      // From the real DOM iframe element we can get
      // the "document" element, it is stored in "contentDocument" property
      // Cypress "its" command can access deep properties using dot notation
      // https://on.cypress.io/its
      .its("0.contentDocument")
      .should("exist")
  );
};

const getIframeBody = () => {
  // get the document
  return (
    getIframeDocument()
      // automatically retries until body is loaded
      .its("body")
      .should("not.be.undefined")
      // wraps "body" DOM element to allow
      // chaining more Cypress commands, like ".find(...)"
      .then(cy.wrap)
  );
};
