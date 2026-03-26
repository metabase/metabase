import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { JWT_SHARED_SECRET } from "e2e/support/helpers";
import type { GetFieldValuesResponse, TemplateTags } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { navigateToEmbedOptionsStep } from "./helpers";

const { ORDERS, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

const { H } = cy;

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > embed parameters";

describe(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();
    H.updateSetting("enable-embedding-static", true);
    H.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);
    H.mockEmbedJsToDevServer();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("dashboard parameter remapping", () => {
    beforeEach(() => {
      // Set up internal remapping for ORDERS.QUANTITY
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
        name: "Quantity",
        type: "internal",
        human_readable_field_id: null,
      });

      cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
        ({ body }: { body: GetFieldValuesResponse }) => {
          cy.request("POST", `/api/field/${ORDERS.QUANTITY}/values`, {
            values: body.values.map(([value]) => [value, `N${value}`]),
          });
        },
      );

      // Set up external remapping: ORDERS.PRODUCT_ID -> PRODUCTS.TITLE
      cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });

      const dashboardTemplateTags: TemplateTags = {
        quantity: {
          id: "quantity",
          name: "quantity",
          "display-name": "Internal",
          type: "dimension",
          "widget-type": "number/=",
          dimension: ["field", ORDERS.QUANTITY, null],
        },
        product_id_fk: {
          id: "product_id_fk",
          name: "product_id_fk",
          "display-name": "FK",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
        },
        user_id_pk: {
          id: "user_id_pk",
          name: "user_id_pk",
          "display-name": "PK->Name",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", PEOPLE.ID, null],
        },
      };

      const dashboardParameters = [
        createMockParameter({
          id: "quantity",
          name: "Internal",
          slug: "quantity",
          type: "number/=",
        }),
        createMockParameter({
          id: "product_id_fk",
          name: "FK",
          slug: "product_id_fk",
          type: "id",
        }),
        createMockParameter({
          id: "user_id_pk",
          name: "PK->Name",
          slug: "user_id_pk",
          type: "id",
        }),
      ];

      H.createNativeQuestionAndDashboard({
        questionDetails: {
          name: "Orders native question",
          native: {
            query:
              "SELECT * " +
              "FROM ORDERS " +
              "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
              "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
            "template-tags": dashboardTemplateTags,
          },
        },
        dashboardDetails: {
          name: "Dashboard with Remapping",
          parameters: dashboardParameters,
        },
      }).then(({ body: { id: dashcardId, card_id, dashboard_id } }) => {
        // Connect dashboard parameters to the card's template-tags
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id: dashcardId,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 8,
              parameter_mappings: [
                {
                  parameter_id: "quantity",
                  card_id,
                  target: ["dimension", ["template-tag", "quantity"]],
                },
                {
                  parameter_id: "product_id_fk",
                  card_id,
                  target: ["dimension", ["template-tag", "product_id_fk"]],
                },
                {
                  parameter_id: "user_id_pk",
                  card_id,
                  target: ["dimension", ["template-tag", "user_id_pk"]],
                },
              ],
            },
          ],
        });
      });
    });

    it("should show remapped parameter values in embed preview", () => {
      navigateToEmbedOptionsStep({
        experience: "dashboard",
        resourceName: "Dashboard with Remapping",
      });

      H.setEmbeddingParameter("Internal", "Editable");
      H.setEmbeddingParameter("FK", "Editable");
      H.setEmbeddingParameter("PK->Name", "Editable");

      H.getSimpleEmbedIframeContent().within(() => {
        // Wait for the last parameter widget is rendered
        cy.findByText("PK->Name").should("be.visible");

        cy.log("internal remapping - select N5 and verify it shows N5");
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .click();
        cy.findByText("N5").click();
        cy.findByText("Add filter").click();
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .should("contain.text", "N5");

        cy.log("FK remapping - enter ID 1 and verify product title appears");
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Rustic Paper Wallet").should("exist");
        cy.findByText("Add filter").click();
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .should("contain.text", "Rustic Paper Wallet");

        cy.log(
          "PK->Name remapping - enter ID 1 and verify person name appears",
        );
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Hudson Borer").should("exist");
        cy.findByText("Add filter").click();
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .should("contain.text", "Hudson Borer");
      });
    });
  });

  describe("question parameter remapping in Guest Embed mode", () => {
    beforeEach(() => {
      // Set up internal remapping for ORDERS.QUANTITY
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
        name: "Quantity",
        type: "internal",
        human_readable_field_id: null,
      });

      cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
        ({ body }: { body: GetFieldValuesResponse }) => {
          cy.request("POST", `/api/field/${ORDERS.QUANTITY}/values`, {
            values: body.values.map(([value]) => [value, `N${value}`]),
          });
        },
      );

      // Set up external remapping: ORDERS.PRODUCT_ID -> PRODUCTS.TITLE
      cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
        name: "Product ID",
        type: "external",
        human_readable_field_id: PRODUCTS.TITLE,
      });

      const questionTemplateTags: TemplateTags = {
        quantity: {
          id: "quantity",
          name: "quantity",
          "display-name": "Internal",
          type: "dimension",
          "widget-type": "number/=",
          dimension: ["field", ORDERS.QUANTITY, null],
        },
        product_id_fk: {
          id: "product_id_fk",
          name: "product_id_fk",
          "display-name": "FK",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", ORDERS.PRODUCT_ID, null],
        },
        user_id_pk: {
          id: "user_id_pk",
          name: "user_id_pk",
          "display-name": "PK->Name",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", PEOPLE.ID, null],
        },
      };

      const questionParameters = [
        createMockParameter({
          id: "quantity",
          name: "Internal",
          slug: "quantity",
          type: "number/=",
          target: ["dimension", ["template-tag", "quantity"]],
        }),
        createMockParameter({
          id: "product_id_fk",
          name: "FK",
          slug: "product_id_fk",
          type: "id",
          target: ["dimension", ["template-tag", "product_id_fk"]],
        }),
        createMockParameter({
          id: "user_id_pk",
          name: "PK->Name",
          slug: "user_id_pk",
          type: "id",
          target: ["dimension", ["template-tag", "user_id_pk"]],
        }),
      ];

      H.createNativeQuestion({
        name: "Question with Remapping",
        native: {
          query:
            "SELECT * " +
            "FROM ORDERS " +
            "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
            "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
          "template-tags": questionTemplateTags,
        },
        parameters: questionParameters,
      });
    });

    it("should show remapped parameter values in embed preview", () => {
      navigateToEmbedOptionsStep({
        experience: "chart",
        resourceName: "Question with Remapping",
      });

      H.setEmbeddingParameter("Internal", "Editable");
      H.setEmbeddingParameter("FK", "Editable");
      H.setEmbeddingParameter("PK->Name", "Editable");

      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByText("Question with Remapping").should("be.visible");

        // Wait for the last parameter widget is rendered
        cy.findByText("PK->Name").should("be.visible");

        cy.log("internal remapping - select N5 and verify it shows N5");
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .click();
        cy.findByText("N5").click();
        cy.findByText("Add filter").click();
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .should("contain.text", "N5");

        cy.log("FK remapping - enter ID 1 and verify product title appears");
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Rustic Paper Wallet").should("exist");
        cy.findByText("Add filter").click();
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .should("contain.text", "Rustic Paper Wallet");

        cy.log(
          "PK->Name remapping - enter ID 1 and verify person name appears",
        );
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Hudson Borer").should("exist");
        cy.findByText("Add filter").click();
        cy.findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .should("contain.text", "Hudson Borer");
      });
    });
  });
});
