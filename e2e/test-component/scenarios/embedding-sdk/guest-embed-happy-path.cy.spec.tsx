import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type NativeQuestionDetails,
  type StructuredQuestionDetails,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createQuestion,
  createQuestionAndDashboard,
  getSignedJwtForResource,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountGuestEmbedDashboard,
  mountGuestEmbedQuestion,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndSetupGuestEmbedding } from "e2e/support/helpers/embedding-sdk-testing";
import { questionAsPinMapWithTiles } from "e2e/test/scenarios/embedding/shared/embedding-questions";
import type { Card, TemplateTags } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS } = SAMPLE_DATABASE;

const WAIT_FOR_INTERNAL_API_REQUESTS_MS = 1000;

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

describe("scenarios > embedding-sdk > guest-embed-happy-path", () => {
  describe("question", () => {
    const setup = ({
      display,
      createQuestionOverride,
    }: {
      display?: Card["display"];
      createQuestionOverride?: () => void;
    } = {}) => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      if (!createQuestionOverride) {
        createQuestion({
          name: "Question for Guest Embed SDK",
          enable_embedding: true,
          embedding_type: "guest-embed",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
            breakout: [["field", ORDERS.PRODUCT_ID, null]],
            limit: 2,
          },
          display,
        }).then(({ body: question }) => {
          cy.wrap(question.id).as("questionId");
        });
      } else {
        createQuestionOverride();
      }

      cy.signOut();
    };

    it("should show question content for unauthorized user", () => {
      setup();

      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/card/*").as("internalApiRequest");

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        mountGuestEmbedQuestion({ token });

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });

    it("should show content of a question with `pivot table` type for unauthorized user", () => {
      setup({ display: "pivot" });

      cy.intercept("/api/card/pivot/*/query*").as("internalApiRequest");

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

        cy.wait("@getCardPivotQuery");

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });

    it("should show content of a question with `map` type  with tiles for unauthorized user", () => {
      setup({
        createQuestionOverride: () => {
          createNativeQuestion(
            questionAsPinMapWithTiles as NativeQuestionDetails,
            {
              wrapId: true,
            },
          );
        },
      });

      cy.intercept("GET", "/api/embed/tiles/card/**").as("mapTilesApiRequest");

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

        cy.wait("@mapTilesApiRequest");

        cy.get("@mapTilesApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length.greaterThan(1);
        });
      });
    });

    it("should properly work with question parameters", () => {
      setup({
        createQuestionOverride: () => {
          createNativeQuestion(
            {
              name: "Orders native question",
              native: {
                query:
                  "SELECT * " +
                  "FROM ORDERS " +
                  "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
                  "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
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
        },
      });

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
              "SELECT * " +
              "FROM ORDERS " +
              "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
              "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
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
    const setup = ({
      display,
      questionDetails,
    }: {
      display?: Card["display"];
      questionDetails?: StructuredQuestionDetails;
    } = {}) => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      createQuestionAndDashboard({
        questionDetails: questionDetails ?? {
          name: "Sample Question",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
              ["field", ORDERS.QUANTITY, null],
            ],
          },
          display,
        },
        dashboardDetails: {
          name: "Embedding SDK Test Dashboard",
          enable_embedding: true,
          embedding_type: "guest-embed",
        },
      }).then(({ body: { dashboard_id } }) => {
        cy.wrap(dashboard_id).as("dashboardId");
      });

      cy.signOut();
    };

    it("should show dashboard content for unauthorized user", () => {
      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/dashboard/*").as("internalApiRequest");

      setup();

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
          cy.findByText("Sample Question").should("be.visible");
        });

        // Wait for requests
        cy.wait(WAIT_FOR_INTERNAL_API_REQUESTS_MS);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });

    it("should show dashboard content with a pivot card for unauthorized user", () => {
      cy.intercept("/api/user/*").as("internalApiRequest");
      cy.intercept("/api/dashboard/*").as("internalApiRequest");

      setup({ display: "pivot" });

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        getSdkRoot().within(() => {
          cy.findByText("Embedding SDK Test Dashboard").should("be.visible");
        });

        // Wait for requests
        cy.wait(WAIT_FOR_INTERNAL_API_REQUESTS_MS);

        cy.get("@internalApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length(0);
        });
      });
    });

    it("should show content of a question with `map` type  with tiles for unauthorized user", () => {
      setup({
        questionDetails: {
          ...questionAsPinMapWithTiles,
          query: {
            "source-table": PEOPLE_ID,
          },
        } as StructuredQuestionDetails,
      });

      cy.intercept("GET", "/api/embed/tiles/dashboard/**").as(
        "mapTilesApiRequest",
      );

      cy.get("@dashboardId").then(async (dashboardId) => {
        const token = await getSignedJwtForResource({
          resourceId: dashboardId as unknown as number,
          resourceType: "dashboard",
        });

        mountGuestEmbedDashboard({ token });

        cy.wait("@mapTilesApiRequest");

        cy.get("@mapTilesApiRequest.all").then((interceptions) => {
          expect(interceptions).to.have.length.greaterThan(1);
        });
      });
    });

    it("should properly work with dashboard parameters", () => {
      signInAsAdminAndSetupGuestEmbedding({
        token: "starter",
      });

      createNativeQuestionAndDashboard({
        questionDetails: {
          name: "Orders native question",
          native: {
            query:
              "SELECT * " +
              "FROM ORDERS " +
              "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
              "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
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
              "SELECT * " +
              "FROM ORDERS " +
              "JOIN PEOPLE ON ORDERS.USER_ID = PEOPLE.ID " +
              "WHERE {{quantity}} AND {{product_id_fk}} AND {{user_id_pk}}",
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
