import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  getSignedJwtForResource,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountGuestEmbedDashboard,
  mountGuestEmbedQuestion,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";
import type { TemplateTags } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

const PARAMETERS = [
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
    values_source_type: "static-list",
    values_source_config: {
      values: ["74"],
    },
  }),
];

const TEMPLATE_TAGS: TemplateTags = {
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

describe("scenarios > embedding-sdk > guest-embed-parameters", () => {
  describe("question", () => {
    it("should properly work with question parameters", () => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      createNativeQuestion(
        {
          name: "Orders native question",
          native: {
            query:
              "SELECT * FROM ORDERS JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
            "template-tags": TEMPLATE_TAGS,
          },
          parameters: PARAMETERS,
          enable_embedding: true,
          embedding_params: {
            quantity: "enabled",
            product_id_fk: "locked",
            user_id_pk: "enabled",
          },
        },
        {
          wrapId: true,
        },
      );

      cy.signOut();

      cy.intercept("GET", "/api/embed/card/*/params/*/values").as(
        "parameterValuesApiRequest",
      );

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
          params: {
            product_id_fk: 1,
          },
        });

        mountGuestEmbedQuestion(
          { token },
          {
            shouldAssertCardQuery: false,
          },
        );

        getSdkRoot().within(() => {
          cy.findAllByTestId("parameter-widget").should("have.length", 2);

          cy.findAllByTestId("parameter-widget")
            .filter(':contains("PK->Name")')
            .click();
        });

        cy.wait("@parameterValuesApiRequest");

        cy.get("@parameterValuesApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(1);
        });

        cy.findByTestId("table-body")
          .findAllByRole("row")
          .should("have.length.above", 10);

        getSdkRoot().within(() => {
          cy.findByTestId("parameter-value-dropdown").contains("74").click();
          cy.findByTestId("parameter-value-dropdown")
            .contains("Add filter")
            .click();

          cy.findByTestId("table-body")
            .findAllByRole("row")
            .should("have.length", 1);
        });
      });
    });

    it("should trigger `/search` endpoint when using search-based parameter", () => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      // Set up external remapping: ORDERS.USER_ID -> PEOPLE.NAME
      cy.request("POST", `/api/field/${ORDERS.USER_ID}/dimension`, {
        type: "external",
        name: "User ID",
        human_readable_field_id: PEOPLE.NAME,
      });

      // Set field to use search instead of dropdown list
      [ORDERS.USER_ID].forEach((id) =>
        cy.request("PUT", `/api/field/${id}`, { has_field_values: "search" }),
      );

      const questionTemplateTags: TemplateTags = {
        user_id: {
          id: "user_id",
          name: "user_id",
          "display-name": "User",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", ORDERS.USER_ID, null],
        },
      };

      const questionParameters = [
        createMockParameter({
          id: "user_id",
          name: "User",
          slug: "user_id",
          type: "id",
          target: ["dimension", ["template-tag", "user_id"]],
        }),
      ];

      createNativeQuestion(
        {
          name: "Orders with User filter",
          native: {
            query: "SELECT * FROM ORDERS WHERE {{user_id}}",
            "template-tags": questionTemplateTags,
          },
          parameters: questionParameters,
          enable_embedding: true,
          embedding_params: {
            user_id: "enabled",
          },
        },
        {
          wrapId: true,
        },
      );

      cy.signOut();

      cy.intercept("GET", "/api/embed/card/*/params/*/search/*").as(
        "parameterSearchApiRequest",
      );

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        mountGuestEmbedQuestion(
          { token },
          {
            shouldAssertCardQuery: false,
          },
        );

        getSdkRoot().within(() => {
          cy.findAllByTestId("parameter-widget").should("have.length", 1);
        });

        cy.log("Click on User parameter and search");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("User")')
          .click();

        // Type in the search input to trigger the search endpoint
        cy.findByPlaceholderText("Search by Name or enter an ID").type("Hud");

        cy.wait("@parameterSearchApiRequest");

        cy.get("@parameterSearchApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length.greaterThan(0);
        });

        // Verify search results are displayed
        cy.findByText("Hudson Borer").should("exist");
      });
    });

    it("should show remapped parameter values and trigger proper `/embed remapping endpoint", () => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      // Set up internal remapping for ORDERS.QUANTITY
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
        name: "Quantity",
        type: "internal",
        human_readable_field_id: null,
      });

      cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
        ({ body }: { body: { values: [number][] } }) => {
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

      createNativeQuestion(
        {
          name: "Orders native question",
          native: {
            query:
              "SELECT * FROM ORDERS JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
            "template-tags": questionTemplateTags,
          },
          parameters: questionParameters,
          enable_embedding: true,
          embedding_params: {
            quantity: "enabled",
            product_id_fk: "enabled",
            user_id_pk: "enabled",
          },
        },
        {
          wrapId: true,
        },
      );

      cy.signOut();

      cy.intercept("GET", "/api/embed/card/*/params/*/remapping*").as(
        "parameterRemappingApiRequest",
      );

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        mountGuestEmbedQuestion(
          { token },
          {
            shouldAssertCardQuery: false,
          },
        );

        getSdkRoot().within(() => {
          cy.findAllByTestId("parameter-widget").should("have.length", 3);
        });

        cy.log("internal remapping");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .click();
        cy.findByText("N5").click();
        cy.findByText("Add filter").click();
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .should("contain.text", "N5");

        cy.log("FK remapping");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Rustic Paper Wallet").should("exist");
        cy.findByText("Add filter").click();
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .should("contain.text", "Rustic Paper Wallet");

        cy.log("PK->Name remapping");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Hudson Borer").should("exist");
        cy.findByText("Add filter").click();
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .should("contain.text", "Hudson Borer");

        cy.get("@parameterRemappingApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length.greaterThan(0);
        });
      });
    });
  });

  describe("dashboard", () => {
    it("should properly work with dashboard parameters", () => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      createNativeQuestionAndDashboard({
        questionDetails: {
          name: "Orders native question",
          native: {
            query:
              "SELECT * FROM ORDERS JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
            "template-tags": TEMPLATE_TAGS,
          },
        },
        dashboardDetails: {
          name: "Embedding SDK Test Dashboard",
          embedding_type: "guest-embed",
          parameters: PARAMETERS,
          enable_embedding: true,
          embedding_params: {
            quantity: "enabled",
            product_id_fk: "locked",
            user_id_pk: "enabled",
          },
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

        cy.wrap(dashboard_id).as("dashboardId");
      });

      cy.signOut();

      cy.intercept("GET", "/api/embed/dashboard/*/params/*/values").as(
        "parameterValuesApiRequest",
      );

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
          params: {
            product_id_fk: 1,
          },
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findAllByTestId("parameter-widget").should("have.length", 2);

          cy.findAllByTestId("parameter-widget")
            .filter(':contains("PK->Name")')
            .click();
        });

        cy.wait("@parameterValuesApiRequest");

        cy.get("@parameterValuesApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(1);
        });

        cy.findByTestId("table-body")
          .findAllByRole("row")
          .should("have.length.above", 10);

        getSdkRoot().within(() => {
          cy.findByTestId("parameter-value-dropdown").contains("74").click();
          cy.findByTestId("parameter-value-dropdown")
            .contains("Add filter")
            .click();

          cy.findByTestId("table-body")
            .findAllByRole("row")
            .should("have.length", 1);
        });
      });
    });

    it("should trigger `/search` endpoint when using search-based parameter", () => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      // Set up external remapping: ORDERS.USER_ID -> PEOPLE.NAME
      cy.request("POST", `/api/field/${ORDERS.USER_ID}/dimension`, {
        type: "external",
        name: "User ID",
        human_readable_field_id: PEOPLE.NAME,
      });

      [ORDERS.USER_ID].forEach((id) =>
        cy.request("PUT", `/api/field/${id}`, { has_field_values: "search" }),
      );

      const dashboardTemplateTags: TemplateTags = {
        user_id: {
          id: "user_id",
          name: "user_id",
          "display-name": "User",
          type: "dimension",
          "widget-type": "id",
          dimension: ["field", ORDERS.USER_ID, null],
        },
      };

      const dashboardParameters = [
        createMockParameter({
          id: "user_id",
          name: "User",
          slug: "user_id",
          type: "id",
          target: ["dimension", ["template-tag", "user_id"]],
        }),
      ];

      createNativeQuestionAndDashboard({
        questionDetails: {
          name: "Orders with User filter",
          native: {
            query: "SELECT * FROM ORDERS WHERE {{user_id}}",
            "template-tags": dashboardTemplateTags,
          },
        },
        dashboardDetails: {
          name: "Search Parameter Test Dashboard",
          embedding_type: "guest-embed",
          parameters: dashboardParameters,
          enable_embedding: true,
          embedding_params: {
            user_id: "enabled",
          },
        },
      }).then(({ body: { id: dashcardId, card_id, dashboard_id } }) => {
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
                  parameter_id: "user_id",
                  card_id,
                  target: ["dimension", ["template-tag", "user_id"]],
                },
              ],
            },
          ],
        });

        cy.wrap(dashboard_id).as("dashboardId");
      });

      cy.signOut();

      cy.intercept("GET", "/api/embed/dashboard/*/params/*/search/*").as(
        "parameterSearchApiRequest",
      );

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findAllByTestId("parameter-widget").should("have.length", 1);
        });

        cy.log("Click on User parameter and search");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("User")')
          .click();

        // Type in the search input to trigger the search endpoint
        cy.findByPlaceholderText("Search by Name or enter an ID").type("Hud");

        cy.wait("@parameterSearchApiRequest");

        cy.get("@parameterSearchApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length.greaterThan(0);
        });

        // Verify search results are displayed
        cy.findByText("Hudson Borer").should("exist");
      });
    });

    it("should show remapped parameter values and trigger proper `/embed remapping endpoint", () => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      // Set up internal remapping for ORDERS.QUANTITY
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
        name: "Quantity",
        type: "internal",
        human_readable_field_id: null,
      });

      cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
        ({ body }: { body: { values: [number][] } }) => {
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

      createNativeQuestionAndDashboard({
        questionDetails: {
          name: "Orders native question",
          native: {
            query:
              "SELECT * FROM ORDERS JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
            "template-tags": dashboardTemplateTags,
          },
        },
        dashboardDetails: {
          name: "Embedding SDK Test Dashboard",
          embedding_type: "guest-embed",
          parameters: dashboardParameters,
          enable_embedding: true,
          embedding_params: {
            quantity: "enabled",
            product_id_fk: "enabled",
            user_id_pk: "enabled",
          },
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

        cy.wrap(dashboard_id).as("dashboardId");
      });

      cy.signOut();

      cy.intercept("GET", "/api/embed/dashboard/*/params/*/remapping*").as(
        "parameterRemappingApiRequest",
      );

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findAllByTestId("parameter-widget").should("have.length", 3);
        });

        cy.log("internal remapping");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .click();
        cy.findByText("N5").click();
        cy.findByText("Add filter").click();
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("Internal")')
          .should("contain.text", "N5");

        cy.log("FK remapping");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Rustic Paper Wallet").should("exist");
        cy.findByText("Add filter").click();
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("FK")')
          .should("contain.text", "Rustic Paper Wallet");

        cy.log("PK->Name remapping");
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .click();
        cy.findByPlaceholderText("Enter an ID").type("1,");
        cy.findByText("Hudson Borer").should("exist");
        cy.findByText("Add filter").click();
        getSdkRoot()
          .findAllByTestId("parameter-widget")
          .filter(':contains("PK->Name")')
          .should("contain.text", "Hudson Borer");

        cy.get("@parameterRemappingApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length.greaterThan(0);
        });
      });
    });
  });
});
