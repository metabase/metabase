const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { questionAsPinMapWithTiles } from "e2e/test/scenarios/embedding/shared/embedding-questions";
import { defer } from "metabase/lib/promise";
const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 15860", { tags: "@skip" }, () => {
  const q1IdFilter = {
    name: "Q1 ID",
    slug: "q1_id",
    id: "fde6db8b",
    type: "id",
    sectionId: "id",
    default: [1],
  };

  const q1CategoryFilter = {
    name: "Q1 Category",
    slug: "q1_category",
    id: "e8ff3175",
    type: "string/=",
    sectionId: "string",
    filteringParameters: [q1IdFilter.id],
  };

  const q2IdFilter = {
    name: "Q2 ID",
    slug: "q2_id",
    id: "t3e6hb7b",
    type: "id",
    sectionId: "id",
    default: [3],
  };

  const q2CategoryFilter = {
    name: "Q2 Category",
    slug: "q2_category",
    id: "ca1n357o",
    type: "string/=",
    sectionId: "string",
    filteringParameters: [q2IdFilter.id],
  };

  function setDefaultValueForLockedFilter(filter, value) {
    cy.findByText("Previewing locked parameters")
      .parent()
      .within(() => {
        cy.findByText(filter).click({ force: true });
      });

    cy.findByPlaceholderText("Enter an ID").type(`${value}{enter}`);
    cy.button("Add filter").click();
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Q1",
        query: { "source-table": PRODUCTS_ID },
      },
      dashboardDetails: {
        embedding_params: {
          q1_id: "locked",
          q1_category: "enabled",
          q2_id: "locked",
          q2_category: "enabled",
        },
        enable_embedding: true,
        parameters: [
          q1IdFilter,
          q1CategoryFilter,
          q2IdFilter,
          q2CategoryFilter,
        ],
      },
      cardDetails: {
        size_x: 11,
        size_y: 6,
      },
    }).then(({ body: { card_id: q1, dashboard_id } }) => {
      // Create a second question with the same source table
      H.createQuestion({
        name: "Q2",
        query: { "source-table": PRODUCTS_ID },
      }).then(({ body: { id: q2 } }) => {
        H.updateDashboardCards({
          dashboard_id,
          cards: [
            // Add card for second question with parameter mappings
            {
              card_id: q2,
              row: 0,
              col: 8,
              size_x: 13,
              size_y: 6,
              parameter_mappings: [
                {
                  parameter_id: q2IdFilter.id,
                  card_id: q2,
                  target: ["dimension", ["field", PRODUCTS.ID, null]],
                },
                {
                  parameter_id: q2CategoryFilter.id,
                  card_id: q2,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
            // Add parameter mappings to first question's card
            {
              card_id: q1,
              parameter_mappings: [
                {
                  parameter_id: q1IdFilter.id,
                  card_id: q1,
                  target: ["dimension", ["field", PRODUCTS.ID, null]],
                },
                {
                  parameter_id: q1CategoryFilter.id,
                  card_id: q1,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
              ],
            },
          ],
        });
      });

      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        embedding_params: {
          q1_id: "locked",
          q1_category: "enabled",
          q2_id: "locked",
          q2_category: "enabled",
        },
        enable_embedding: true,
      });

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });
  });

  it("should work for locked linked filters connected to different cards with the same source table (metabase#15860)", () => {
    setDefaultValueForLockedFilter("Q1 ID", 1);
    setDefaultValueForLockedFilter("Q2 ID", 3);

    H.visitIframe();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Q1 Category").click();

    H.popover().within(() => {
      cy.findByRole("listitem")
        .should("have.length", 1)
        .and("contain", "Gizmo");
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Q2 Category").click();

    H.popover().within(() => {
      cy.findByRole("listitem")
        .should("have.length", 1)
        .and("contain", "Doohickey");
    });
  });
});

describe("issue 20438", () => {
  const questionDetails = {
    name: "20438",
    native: {
      query:
        "SELECT * FROM PRODUCTS\nWHERE true\n    [[AND {{CATEGORY}}]]\n limit 30",
      "template-tags": {
        CATEGORY: {
          id: "24f69111-29f8-135f-9321-1ff94bbb31ad",
          name: "CATEGORY",
          "display-name": "Category",
          type: "dimension",
          dimension: ["field", PRODUCTS.CATEGORY, null],
          "widget-type": "string/=",
          default: null,
        },
      },
    },
  };

  const filter = {
    name: "Text",
    slug: "text",
    id: "b555d25b",
    type: "string/=",
    sectionId: "string",
  };

  const dashboardDetails = {
    parameters: [filter],
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/embed/dashboard/**").as("getEmbed");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      // Connect filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 24,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: filter.id,
                card_id,
                target: ["dimension", ["template-tag", "CATEGORY"]],
              },
            ],
          },
        ],
      });

      // Enable embedding and enable the "Text" filter
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        enable_embedding: true,
        embedding_params: { [filter.slug]: "enabled" },
      });

      cy.wrap(card_id).as("questionId");
      cy.wrap(dashboard_id).as("dashboardId");

      H.visitDashboard(dashboard_id);
    });
  });

  it("dashboard filter connected to the field filter should work with a single value in embedded dashboards (metabase#20438)", () => {
    cy.get("@dashboardId").then((dashboardId) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboardId,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    H.visitIframe();

    cy.wait("@getEmbed");

    H.filterWidget().click();
    cy.wait("@getEmbed");

    H.popover().contains("Doohickey").click();
    cy.wait("@getEmbed");

    cy.button("Add filter").click();
    cy.wait("@getEmbed");

    cy.findAllByRole("gridcell")
      // One of product titles for Doohickey
      .should("contain", "Small Marble Shoes")
      // One of product titles for Gizmo
      .and("not.contain", "Rustic Paper Wallet");
  });
});

describe("locked parameters in embedded question (metabase#20634)", () => {
  beforeEach(() => {
    cy.intercept("PUT", "/api/card/*").as("publishChanges");

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(
      {
        name: "20634",
        native: {
          query: "select {{text}}",
          "template-tags": {
            text: {
              id: "abc-123",
              name: "text",
              "display-name": "Text",
              type: "text",
              default: null,
            },
          },
        },
      },
      {
        visitQuestion: true,
        wrapId: true,
      },
    );
  });

  it("should let the user lock parameters to specific values", () => {
    cy.get("@questionId").then((questionId) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: questionId,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    H.modal().within(() => {
      // select the dropdown next to the Text parameter so that we can set the value to "Locked"
      cy.findByText("Text")
        .parent()
        .within(() => {
          cy.findByText("Disabled").click();
        });
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Locked").click();

    H.modal().within(() => {
      // set a parameter value
      cy.findByPlaceholderText("Text").type("foo{enter}");

      // publish the embedded question so that we can directly navigate to its url
      cy.findByText("Publish changes").click();
      cy.wait("@publishChanges");
    });

    // directly navigate to the embedded question
    H.visitIframe();

    // verify that the Text parameter doesn't show up but that its value is reflected in the dashcard
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Text").should("not.exist");
    cy.get(".CardVisualization").within(() => {
      cy.contains("foo");
    });
  });
});

describe("issues 20845, 25031", () => {
  /**
   * @param {string} defaultValue - The default value for the defined filter
   * @returns object
   */
  function getQuestionDetails(defaultValue = undefined) {
    return {
      name: "20845",
      native: {
        "template-tags": {
          qty_locked: {
            id: "6bd8d7be-bd5b-382c-cfa2-683461891663",
            name: "qty_locked",
            "display-name": "Qty locked",
            type: "number",
            required: defaultValue ? true : false,
            default: defaultValue,
          },
        },
        query:
          "select count(*) from orders where true [[AND quantity={{qty_locked}}]]",
      },
    };
  }
  const defaultFilterValues = [undefined, "10"];
  defaultFilterValues.forEach((value) => {
    const conditionalPartOfTestTitle = value
      ? "and the required filter with the default value"
      : "";
    const dashboardFilter = {
      name: "Equal to",
      slug: "equal_to",
      id: "c269ebe1",
      type: "number/=",
      sectionId: "number",
    };

    const dashboardDetails = {
      name: "25031",
      parameters: [dashboardFilter],
    };

    beforeEach(() => {
      cy.intercept("PUT", "/api/card/*").as("publishChanges");

      H.restore();
      cy.signInAsAdmin();

      const questionDetails = getQuestionDetails(value);

      H.createNativeQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { id, dashboard_id, card_id } }) => {
        cy.wrap(card_id).as("questionId");
        cy.wrap(dashboard_id).as("dashboardId");

        H.visitQuestion(card_id);

        // Connect dashbaord filter to the card
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              card_id,
              id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
              parameter_mappings: [
                {
                  parameter_id: dashboardFilter.id,
                  card_id,
                  target: ["variable", ["template-tag", "qty_locked"]],
                },
              ],
            },
          ],
        });
      });
    });

    it(`QUESTION: locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#20845)`, () => {
      cy.get("@questionId").then((questionId) => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            qty_locked: "locked",
          },
        });

        // This issue is not possible to reproduce using UI from this point on.
        // We have to manually send the payload in order to make sure it works for both strings and integers.
        ["string", "integer"].forEach((type) => {
          cy.log(
            `Make sure it works with ${type.toUpperCase()} in the payload`,
          );

          H.visitEmbeddedPage({
            resource: { question: questionId },
            params: {
              qty_locked: type === "string" ? "15" : 15, // IMPORTANT: integer
            },
          });
        });

        H.tableInteractiveHeader("COUNT(*)");
        cy.findByRole("gridcell").should("contain", "5");
      });
    });

    it(`DASHBOARD: locked parameter should work with numeric values ${conditionalPartOfTestTitle} (metabase#25031)`, () => {
      cy.get("@dashboardId").then((dashboardId) => {
        H.visitDashboard(dashboardId);
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          enable_embedding: true,
          embedding_params: {
            [dashboardFilter.slug]: "locked",
          },
        });

        // This issue is not possible to reproduce using UI from this point on.
        // We have to manually send the payload in order to make sure it works for both strings and integers.
        ["string", "integer"].forEach((type) => {
          cy.log(
            `Make sure it works with ${type.toUpperCase()} in the payload`,
          );

          const payload = {
            resource: { dashboard: dashboardId },
            params: {
              [dashboardFilter.slug]: type === "string" ? "15" : 15, // IMPORTANT: integer
            },
          };

          H.visitEmbeddedPage(payload);

          // wait for the results to load
          cy.contains(dashboardDetails.name);
          cy.get(".CardVisualization")
            .should("contain", "COUNT(*)")
            .and("contain", "5");
        });
      });
    });
  });
});

// TODO:
// - Add tests for embedding previews in both cases
// - Add tests for disabled, editable and locked parameters in both cases
// BONUS: Ideally add tests for email subscriptions with the filter applied
describe("issue 27643", { tags: "@external" }, () => {
  const PG_DB_ID = 2;
  const TEMPLATE_TAG_NAME = "expected_invoice";
  const getQuestionDetails = (fieldId) => {
    return {
      name: "27643",
      database: PG_DB_ID,
      native: {
        query:
          "SELECT * FROM INVOICES [[ where {{ expected_invoice }} ]] limit 1",
        "template-tags": {
          [TEMPLATE_TAG_NAME]: {
            id: "3cfb3686-0d13-48db-ab5b-100481a3a830",
            dimension: ["field", fieldId, null],
            name: TEMPLATE_TAG_NAME,
            "display-name": "Expected Invoice",
            type: "dimension",
            "widget-type": "string/=",
          },
        },
      },
      enable_embedding: true,
      embedding_params: {
        [TEMPLATE_TAG_NAME]: "enabled",
      },
    };
  };

  beforeEach(() => {
    // This issue was only reproducible against the Postgres database.
    H.restore("postgres-12");
    cy.signInAsAdmin();
    H.withDatabase(PG_DB_ID, ({ INVOICES }) => {
      cy.wrap(INVOICES.EXPECTED_INVOICE).as(
        "postgresInvoicesExpectedInvoiceId",
      );
    });
  });

  describe("should allow a dashboard filter to map to a boolean field filter parameter (metabase#27643)", () => {
    beforeEach(() => {
      const dashboardParameter = {
        id: "2850aeab",
        name: "Text filter for boolean field",
        slug: "text_filter_for_boolean_field",
        type: "string/=",
      };

      const dashboardDetails = {
        name: "Dashboard with card with boolean field filter",
        enable_embedding: true,
        embedding_params: {
          [dashboardParameter.slug]: "enabled",
        },
        parameters: [dashboardParameter],
      };

      cy.get("@postgresInvoicesExpectedInvoiceId")
        .then((fieldId) => {
          H.createNativeQuestionAndDashboard({
            questionDetails: getQuestionDetails(fieldId),
            dashboardDetails,
          });
        })
        .then(({ body: dashboardCard }) => {
          const { card_id, dashboard_id } = dashboardCard;

          cy.wrap(dashboard_id).as("dashboardId");
          cy.wrap(card_id).as("questionId");

          const mapFilterToCard = {
            parameter_mappings: [
              {
                parameter_id: dashboardParameter.id,
                card_id,
                target: ["dimension", ["template-tag", TEMPLATE_TAG_NAME]],
              },
            ],
          };

          H.editDashboardCard(dashboardCard, mapFilterToCard);
        });
    });

    it("in static embedding and in public dashboard scenarios (metabase#27643-1)", () => {
      cy.log("Test the dashboard");
      H.visitDashboard("@dashboardId");
      H.getDashboardCard().should("contain", "true");
      H.toggleFilterWidgetValues(["false"]);
      H.getDashboardCard().should("contain", "false");

      cy.log("Test the embedded dashboard");
      cy.get("@dashboardId").then((dashboard) => {
        H.visitEmbeddedPage({
          resource: { dashboard },
          params: {},
        });

        H.getDashboardCard().should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        H.getDashboardCard().should("contain", "false");
      });

      cy.log("Test the public dashboard");
      cy.get("@dashboardId").then((dashboardId) => {
        // We were signed out due to the previous visitEmbeddedPage
        cy.signInAsAdmin();
        H.visitPublicDashboard(dashboardId);

        H.getDashboardCard().should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        H.getDashboardCard().should("contain", "false");
      });
    });
  });

  describe("should allow a native question filter to map to a boolean field filter parameter (metabase#27643)", () => {
    beforeEach(() => {
      cy.get("@postgresInvoicesExpectedInvoiceId").then((fieldId) => {
        H.createNativeQuestion(getQuestionDetails(fieldId), {
          wrapId: true,
          idAlias: "questionId",
        });
      });
    });

    it("in static embedding and in public question scenarios (metabase#27643-2)", () => {
      cy.log("Test the question");
      H.visitQuestion("@questionId");
      cy.findAllByRole("gridcell").should("contain", "true");
      H.toggleFilterWidgetValues(["false"]);
      H.queryBuilderMain().button("Get Answer").click();
      cy.findAllByRole("gridcell").should("contain", "false");

      cy.log("Test the embedded question");
      cy.get("@questionId").then((question) => {
        H.visitEmbeddedPage({
          resource: { question },
          params: {},
        });

        cy.findAllByRole("gridcell").should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        cy.findAllByRole("gridcell").should("contain", "false");
      });

      cy.log("Test the public question");
      cy.get("@questionId").then((questionId) => {
        // We were signed out due to the previous visitEmbeddedPage
        cy.signInAsAdmin();
        H.visitPublicQuestion(questionId);

        cy.findAllByRole("gridcell").should("contain", "true");
        H.toggleFilterWidgetValues(["false"]);
        cy.findAllByRole("gridcell").should("contain", "false");
      });
    });
  });
});

describe("issue 30535", () => {
  const questionDetails = {
    name: "3035",
    query: {
      "source-table": PRODUCTS_ID,
      limit: 10,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_cat: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    });

    H.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      H.visitQuestion(id);

      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: id,
        activeTab: "parameters",
        previewMode: "preview",
        unpublishBeforeOpen: false,
      });
    });
  });

  it("user session should not apply sandboxing to a signed embedded question (metabase#30535)", () => {
    cy.document().then((doc) => {
      const iframe = doc.querySelector("iframe");

      cy.signOut();
      cy.signInAsSandboxedUser();

      cy.visit(iframe.src);
    });

    cy.findByRole("grid").within(() => {
      // The sandboxed user has an attribute cat="Widget"
      cy.findAllByText("Widget");
      // Sandboxing shouldn't affect results so we should see other product categories as well
      cy.findAllByText("Gizmo");
    });
  });
});

describe("dashboard preview", () => {
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

  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );
    cy.intercept("GET", "/api/preview_embed/dashboard/**/params/**/values").as(
      "previewValues",
    );

    H.restore();
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
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
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

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        previewMode: "preview",
      });
    });

    H.modal().within(() => {
      // Makes it less likely to flake.
      cy.wait("@previewDashboard");

      H.getIframeBody().within(() => {
        cy.log(
          "Set filter 2 value, so filter 1 should be filtered by filter 2",
        );
        cy.button(filter2.name).click();
        cy.wait("@previewValues");
        H.popover().within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Doohickey").click();
          cy.button("Add filter").click();
        });

        cy.log("Assert filter 1");
        cy.button(filter.name).click();
        H.popover().within(() => {
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
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { card_id, dashboard_id } }) => {
      H.addOrUpdateDashboardCard({
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

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        previewMode: "preview",
      });
    });

    // Makes it less likely to flake.
    cy.wait("@previewDashboard");

    cy.log("Set the first locked parameter values");
    H.modal()
      .findByRole("generic", { name: "Previewing locked parameters" })
      .findByText("Text 1")
      .click();
    H.popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    cy.log("Set the second locked parameter values");
    H.modal()
      .findByRole("generic", { name: "Previewing locked parameters" })
      .findByText("Text 2")
      .click();
    H.popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.findByText("Gizmo").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    // Wait for the iframe to load
    H.getIframeBody().within(() => {
      cy.button(filter.name).should("not.exist");
    });

    H.getIframeBody().within(() => {
      cy.log("Assert filter 1");
      cy.button(filter.name).click();
      H.popover().within(() => {
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
        cy.findByText("Doohickey").should("be.visible");
      });
    });
  });
});

describe("issue 40660", () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const dashboardDetails = {
    name: "long dashboard",
    enable_embedding: true,
  };

  beforeEach(() => {
    cy.intercept("GET", "/api/preview_embed/dashboard/**").as(
      "previewDashboard",
    );

    H.restore();
    cy.signInAsAdmin();
  });

  it("static dashboard content shouldn't overflow its container (metabase#40660)", () => {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      H.updateDashboardCards({
        dashboard_id,
        cards: [{ card_id }, { card_id }, { card_id }],
      });

      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "parameters",
        previewMode: "preview",
      });
    });

    H.getIframeBody().within(() => {
      cy.findByText(dashboardDetails.name).should("be.visible");
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findAllByText("1018947080336").should("have.length", 3);
      cy.findByTestId("embed-frame").scrollTo("bottom");

      cy.findByRole("link", { name: "Powered by Metabase" })
        .scrollIntoView()
        .should("be.visible");
    });
  });
});

// Skipped since it does not make sense when CSP is disabled
describe("issue 49142", { tags: "@skip" }, () => {
  const questionDetails = {
    name: "Products",
    query: { "source-table": PRODUCTS_ID, limit: 2 },
  };

  const dashboardDetails = {
    name: "Embeddable dashboard",
    enable_embedding: true,
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("embedding preview should be always working", () => {
    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);

      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: dashboard_id,
        activeTab: "lookAndFeel",
        previewMode: "preview",
      });
    });

    cy.findByTestId("embed-preview-iframe")
      .its("0.contentDocument.body")
      .should("be.visible")
      .and("contain", "Embeddable dashboard");
  });
});

describe("issue 8490", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");

    H.createDashboardWithQuestions({
      dashboardDetails: {
        name: "Dashboard to test locale",
        enable_embedding: true,
      },
      questions: [
        {
          name: "Line chart",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
              [
                "field",
                PRODUCTS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            filter: [
              "between",
              ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
              "2024-01-01",
              "2025-01-01",
            ],
          },
          limit: 100,
          visualization_settings: {
            "graph.dimensions": ["CREATED_AT", "CATEGORY"],
            "graph.metrics": ["count"],
          },
          display: "bar",
          enable_embedding: true,
        },
        {
          name: "Order quantity trend",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "sum",
                ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
              ],
            ],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
            filter: [
              "and",
              [
                "between",
                ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
                "2024-10-01",
                "2024-12-01",
              ],
              [
                "=",
                [
                  "field",
                  PRODUCTS.VENDOR,
                  {
                    "base-type": "type/Text",
                    "source-field": ORDERS.PRODUCT_ID,
                  },
                ],
                "Alfreda Konopelski II Group",
              ],
            ],
          },
          display: "smartscalar",
        },
        {
          name: "Pie chart",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              [
                "field",
                PRODUCTS.VENDOR,
                { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
            limit: 5,
          },
          visualization_settings: {
            "pie.slice_threshold": 20,
          },
          display: "pie",
        },
      ],
      cards: [{}, { col: 11 }],
    }).then(({ dashboard, questions: [lineChartQuestion] }) => {
      cy.wrap(dashboard.id).as("dashboardId");
      cy.wrap(lineChartQuestion.id).as("lineChartQuestionId");
    });
  });

  it("static embeddings with `#locale` should show translate the loading message (metabase#50182)", () => {
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/dashboard/*",
        middleware: true,
      },
      (req) => {
        req.on("response", (res) => {
          const MINUTE = 60 * 1000;
          res.setDelay(MINUTE);
        });
      },
    ).as("dashboardRequest");
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/card/*",
        middleware: true,
      },
      (req) => {
        req.on("response", (res) => {
          const MINUTE = 60 * 1000;
          res.setDelay(MINUTE);
        });
      },
    ).as("questionRequest");

    cy.log("test a static embedded dashboard");
    cy.get("@dashboardId").then((dashboardId) => {
      H.visitEmbeddedPage(
        {
          resource: { dashboard: dashboardId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    // Loading...
    cy.findByTestId("embed-frame")
      .findByText("로드 중...")
      .should("be.visible");

    cy.log("test a static embedded question");
    cy.get("@lineChartQuestionId").then((lineChartQuestionId) => {
      H.visitEmbeddedPage(
        {
          resource: { question: lineChartQuestionId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    // Loading...
    cy.findByTestId("embed-frame").findByText("로딩...").should("be.visible");
  });

  it("static embeddings should respect `#locale` hash parameter (metabase#8490, metabase#50182)", () => {
    cy.log("test a static embedded dashboard");
    const {
      promise: dashboardLoaderPromise,
      resolve: resolveDashboardLoaderPromise,
    } = defer();
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/dashboard/*",
      },
      () => dashboardLoaderPromise,
    ).as("dashboardRequest");

    cy.get("@dashboardId").then((dashboardId) => {
      H.visitEmbeddedPage(
        {
          resource: { dashboard: dashboardId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    cy.findByTestId("embed-frame").within(() => {
      cy.log(
        "static embeddings with `#locale` should show a translated the loading message",
      );
      // Loading...
      cy.findByText("로드 중...")
        .should("be.visible")
        .then(resolveDashboardLoaderPromise);

      cy.log("assert the line chart");
      H.getDashboardCard(0).within(() => {
        // X-axis labels: Jan 2024 (or some other year)
        cy.findByText(/^1월 20\d\d\b/).should("be.visible");
        // Aggregation "count"
        cy.findByText("카운트").should("be.visible");
      });
    });

    cy.findByTestId("embed-frame").within(() => {
      cy.log("assert the trend chart");
      H.getDashboardCard(2).within(() => {
        // N/A
        cy.findByText("해당 없음").should("be.visible");
        // (No data)
        cy.findByText("(데이터 없음)").should("be.visible");
      });

      cy.log("assert the pie chart");
      H.getDashboardCard(1).within(() => {
        // Total
        cy.findByText("합계").should("be.visible");
        // Other
        cy.findByTestId("chart-legend").findByText("기타").should("be.visible");
      });
    });

    cy.log("test a static embedded question");
    const {
      promise: questionLoaderPromise,
      resolve: resolveQuestionLoaderPromise,
    } = defer();
    cy.intercept(
      {
        method: "GET",
        url: "/api/embed/card/*",
      },
      () => questionLoaderPromise,
    ).as("questionRequest");

    cy.log("assert the line chart");
    cy.get("@lineChartQuestionId").then((lineChartQuestionId) => {
      H.visitEmbeddedPage(
        {
          resource: { question: lineChartQuestionId },
          params: {},
        },
        {
          additionalHashOptions: {
            locale: "ko",
          },
        },
      );
    });

    cy.findByTestId("embed-frame").within(() => {
      cy.log(
        "static embeddings with `#locale` should show a translated the loading message",
      );
      // Loading...
      cy.findByText("로딩...")
        .should("be.visible")
        .then(resolveQuestionLoaderPromise);

      // X-axis labels: Jan 2023 (or some other year)
      cy.findByText(/11월 20\d\d\b/).should("be.visible");
      // Aggregation "count"
      cy.findByText("카운트").should("be.visible");
    });
  });
});

describe("issue 50373", () => {
  it("should return cache headers in production for js bundle", () => {
    cy.intercept(
      {
        method: "GET",
        url: /^\/app\/dist\/(.*)\.js$/,
      },
      (req) => {
        // When running in development (e.g. with `yarn dev`),
        // the *.hot.bundle.js hot-reloaded file is served by the dev server.
        if (req.url.includes("hot.bundle.js")) {
          return;
        }

        req.on("response", (res) => {
          expect(
            res.headers["cache-control"],
            `Invalid Cache-Control header for ${req.url}`,
          ).to.equal("public, max-age=31536000");
        });
      },
    );

    H.visitEmbeddedPage({ resource: { dashboard: ORDERS_DASHBOARD_ID } });
  });
});

describe("issue 51934 (EMB-189)", () => {
  const COLLECTION_NAME = "Model Collection";
  const MODEL_IN_ROOT_NAME = "Products Model";
  const MODEL_IN_COLLECTION_NAME = "QA Postgres12 Orders Model";
  const QUESTION_IN_COLLECTION_NAME = "Orders Question";

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.createModelFromTableName({
      tableName: "products",
      modelName: MODEL_IN_ROOT_NAME,
    });
    H.createCollection({
      name: COLLECTION_NAME,
      alias: "collectionId",
    });
    H.createModelFromTableName({
      tableName: "orders",
      modelName: MODEL_IN_COLLECTION_NAME,
      idAlias: "modelId",
    });
    moveToCollection({
      collectionIdAlias: "collectionId",
      cardIdAlias: "modelId",
    });
    H.createQuestion(
      {
        name: QUESTION_IN_COLLECTION_NAME,
        query: {
          "source-table": ORDERS_ID,
        },
      },
      {
        wrapId: true,
        idAlias: "questionId",
      },
    );
    moveToCollection({
      collectionIdAlias: "collectionId",
      cardIdAlias: "questionId",
    });
  });

  it("should set the starting join step based on the query source", () => {
    startNewEmbeddingQuestion();
    const QA_DB_NAME = "QA Postgres12";
    const DATA_SOURCE_NAME = "Orders";

    cy.log("select a table as a data source");
    H.popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByRole("heading", { name: QA_DB_NAME }).click();
      cy.findByRole("option", { name: DATA_SOURCE_NAME }).click();
    });
    H.getNotebookStep("data").button("Join data").click();

    cy.log(
      'select the "Join" step when the data source is a table will open a table in the same database',
    );
    H.popover().within(() => {
      cy.findByText(QA_DB_NAME).should("be.visible");
      cy.findByRole("option", { name: "Orders" }).should("be.visible");
    });

    cy.log(
      "changing the data source while not selecting the join step should refresh the data picker on the join step",
    );
    H.getNotebookStep("data").findByText(DATA_SOURCE_NAME).click();

    cy.log('go back to the "Bucket" step');
    H.popover().within(() => {
      cy.icon("chevronleft").click();
      cy.icon("chevronleft").click();
    });

    cy.log(
      "select a question as a data source should open the saved question step in the same collection as the data source (metabase#58357)",
    );
    H.popover().within(() => {
      cy.findByText("Saved Questions").click();
      cy.findByRole("menuitem", { name: COLLECTION_NAME }).click();
      cy.findByRole("menuitem", { name: QUESTION_IN_COLLECTION_NAME }).click();
    });

    cy.log("the join popover is automatically opened");
    H.popover().within(() => {
      cy.log("the collection of the data source should be selected");
      cy.findByRole("menuitem", { name: COLLECTION_NAME }).should(
        "have.css",
        "background-color",
        // brand color
        "rgb(80, 158, 226)",
      );
      cy.findByRole("menuitem", { name: QUESTION_IN_COLLECTION_NAME })
        .should("be.visible")
        .click();
    });

    cy.log(
      "select a model as a data source should open the model step in the same collection as the data source",
    );
    H.getNotebookStep("data").findByText(QUESTION_IN_COLLECTION_NAME).click();

    H.popover().within(() => {
      // Go back to the "Bucket" step
      cy.findByText("Saved Questions").click();

      // We're now at the "Bucket" step
      cy.findByText("Models").click();
      cy.findByRole("menuitem", { name: COLLECTION_NAME }).click();
      cy.findByRole("menuitem", { name: MODEL_IN_COLLECTION_NAME }).click();
    });

    cy.log("the join popover is automatically opened");
    H.popover().within(() => {
      cy.log("the collection of the data source should be selected");
      cy.findByRole("menuitem", { name: COLLECTION_NAME }).should(
        "have.css",
        "background-color",
        // brand color
        "rgb(80, 158, 226)",
      );
      cy.findByRole("menuitem", { name: MODEL_IN_COLLECTION_NAME })
        .should("be.visible")
        .click();
    });

    cy.log(
      "select a data source after selecting a join step should refresh the data picker on the join step",
    );
    H.getNotebookStep("data").findByText(MODEL_IN_COLLECTION_NAME).click();
    H.popover().within(() => {
      cy.findByRole("menuitem", { name: "Our analytics" }).click();
      cy.findByRole("menuitem", { name: MODEL_IN_ROOT_NAME }).click();
    });

    H.popover().within(() => {
      cy.log("the collection of the new data source should be selected");
      cy.findByRole("menuitem", { name: "Our analytics" }).should(
        "have.css",
        "background-color",
        // brand color
        "rgb(80, 158, 226)",
      );
      cy.findByRole("menuitem", { name: MODEL_IN_ROOT_NAME }).should(
        "be.visible",
      );
    });
  });

  function startNewEmbeddingQuestion() {
    H.visitFullAppEmbeddingUrl({
      url: "/question/notebook",
      qs: {
        data_picker: "staged",
        entity_types: "table,model,question",
      },
    });
  }

  function moveToCollection({ collectionIdAlias, cardIdAlias }) {
    cy.get(`@${collectionIdAlias}`).then((collectionId) => {
      cy.get(`@${cardIdAlias}`).then((cardId) => {
        cy.request("PUT", `/api/card/${cardId}`, {
          collection_id: collectionId,
        });
      });
    });
  }
});

describe("issue 63687", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should properly display pin map tiles without auth errors for a valid JWT token", () => {
    H.createNativeQuestion(questionAsPinMapWithTiles, {
      visitQuestion: true,
      wrapId: true,
    });

    cy.get("@questionId").then((questionId) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: questionId,
        activeTab: "parameters",
        unpublishBeforeOpen: false,
      });
    });

    cy.intercept("/api/embed/tiles/**").as("getTiles");

    H.visitIframe();

    cy.wait("@getTiles").then(({ response: tileResponse }) => {
      expect(tileResponse?.statusCode).to.equal(200);
    });
  });
});
