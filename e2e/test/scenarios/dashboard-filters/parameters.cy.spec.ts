const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import { checkNotNull } from "metabase/utils/types";
import type {
  ConcreteFieldReference,
  ParameterTarget,
} from "metabase-types/api";
import {
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const { ORDERS_ID, ORDERS, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

// Assert the dashboard URL's query params match `expected`, regardless of the
// order in which the slugs are serialized. That order is not deterministic, so
// asserting on the exact search string is flaky (metabase#17933). Comparing the
// parsed params also sidesteps async-update timing, since `.should(callback)`
// retries until the URL settles.
const expectSearchParams = (expected: Record<string, string>) =>
  cy.location("search").should((search) => {
    expect(Object.fromEntries(new URLSearchParams(search))).to.deep.eq(
      expected,
    );
  });

describe("scenarios > dashboard > parameters", () => {
  const cards = [
    {
      card_id: ORDERS_COUNT_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 5,
      size_y: 4,
    },
    {
      card_id: ORDERS_COUNT_QUESTION_ID,
      row: 0,
      col: 5,
      size_x: 5,
      size_y: 4,
    },
  ];

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should handle multiple filters and allow multiple filter values without sending superfluous queries or limiting results (metabase#13150, metabase#15689, metabase#15695, metabase#16103, metabase#17139)", () => {
    const questionDetails = {
      name: "13150 (Products)",
      query: { "source-table": PRODUCTS_ID },
    };

    const parameters = [
      {
        name: "Title",
        slug: "title",
        id: "9f20a0d5",
        type: "string/=",
        sectionId: "string",
      },
      {
        name: "Category",
        slug: "category",
        id: "719fe1c2",
        type: "string/=",
        sectionId: "string",
      },
      {
        name: "Vendor",
        slug: "vendor",
        id: "a73b7c9",
        type: "string/=",
        sectionId: "string",
      },
    ];

    const [titleFilter, categoryFilter, vendorFilter] = parameters;

    const dashboardDetails = { parameters };

    cy.intercept(
      "POST",
      "/api/dashboard/*/dashcard/*/card/*/query",
      cy.spy().as("cardQueryRequest"),
    ).as("cardQuery");

    cy.intercept(
      "GET",
      `/api/dashboard/*/params/${categoryFilter.id}/values`,
      cy.spy().as("fetchAllCategories"),
    ).as("filterValues");

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.log("Connect all filters to the card");
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 19,
              size_y: 12,
              parameter_mappings: [
                {
                  parameter_id: titleFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.TITLE, null]],
                },
                {
                  parameter_id: categoryFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
                },
                {
                  parameter_id: vendorFilter.id,
                  card_id,
                  target: ["dimension", ["field", PRODUCTS.VENDOR, null]],
                },
              ],
              visualization_settings: {},
            },
          ],
        });

        cy.visit(
          `/dashboard/${dashboard_id}?title=Awesome Concrete Shoes&category=Widget&vendor=McClure-Lockman`,
        );
      },
    );

    cy.wait("@cardQuery");
    // Multiple filters shouldn't affect the number of card query requests (metabase#13150)
    cy.get("@cardQueryRequest").should("have.been.calledOnce");

    // Open category dropdown
    H.filterWidget().contains("Widget").click();
    cy.wait("@filterValues");

    // Make sure all filters were fetched (should be cached after this)
    H.popover().within(() => {
      // Widget should be selected by default
      isFilterSelected("Widget", true);
      // Select one more filter (metabase#15689)
      cy.findByText("Gizmo").click();
      isFilterSelected("Gizmo", true);

      cy.findByText("Doohickey");
      cy.findByText("Gadget");
    });

    cy.get("@fetchAllCategories").should("have.been.calledOnce");

    cy.button("Update filter").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2 selections").click();

    // As a sanity check, make sure we can deselect the filter by clicking on it
    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      isFilterSelected("Gizmo", false);
    });

    // Even after we reopen the dropdown, it shouldn't send additional requests for values (metabase#16103)
    cy.get("@fetchAllCategories").should("have.been.calledOnce");

    cy.button("Update filter").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2 selections").should("not.exist");
    H.filterWidget().contains("Widget");

    H.filterWidget().contains("Awesome Concrete Shoes").click();
    // Do not limit number of results (metabase#15695)
    // Prior to the issue being fixed, the cap was 100 results
    cy.findByPlaceholderText("Search the list").type("Syner");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Synergistic Wool Coat");

    cy.location("search").should(
      "eq",
      "?category=Widget&title=Awesome+Concrete+Shoes&vendor=McClure-Lockman",
    );
    H.tableInteractiveBody().findAllByRole("row").should("have.length", 1);

    // It should not reset previously defined filters when exiting 'edit' mode without making any changes (metabase#5332, metabase#17139)
    H.editDashboard();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Cancel").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You're editing this dashboard.").should("not.exist");

    cy.location("search").should(
      "eq",
      "?category=Widget&title=Awesome+Concrete+Shoes&vendor=McClure-Lockman",
    );
    H.tableInteractiveBody().findAllByRole("row").should("have.length", 1);
  });

  describe("when parameters are (dis)connected to dashcards", () => {
    beforeEach(() => {
      H.createDashboard().then(({ body: { id } }) => {
        H.updateDashboardCards({ dashboard_id: id, cards });
        H.visitDashboard(id);
      });

      const { interceptor } = H.spyRequestFinished("dashcardRequestSpy");

      cy.intercept(
        "POST",
        "/api/dashboard/*/dashcard/*/card/*/query",
        interceptor,
      );

      // create a disconnected filter + a default value
      H.editDashboard();
      H.setFilter("Date picker", "Relative Date");

      H.sidebar().findByText("Default value").next().click();
      H.popover().contains("Previous 7 days").click({ force: true });
      H.saveDashboard();
    });

    it("should fetch dashcard data on save only when parameter mappings change", () => {
      cy.log("Saving a disconnected filter does not fetch dashcard data");
      cy.get("@dashcardRequestSpy").should("not.have.been.called");

      cy.log("Saving without changes does not fetch dashcard data");
      H.editDashboard();
      H.saveDashboard({ awaitRequest: false });

      cy.get("@dashcardRequestSpy").should("have.callCount", 0);

      cy.log("Connect filter to 1 card only");

      H.editDashboard();
      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Date")
        .click();
      H.selectDashboardFilter(H.getDashboardCard(0), "Created At");

      H.saveDashboard();

      cy.get("@dashcardRequestSpy").should("have.callCount", 1);

      cy.log("Disconnect filter from the 1st card");

      H.editDashboard();

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Date")
        .click();

      H.disconnectDashboardFilter(H.getDashboardCard(0));
      H.saveDashboard();

      cy.get("@dashcardRequestSpy").should("have.callCount", 2);

      cy.log("Connect filter to 2 cards");
      H.editDashboard();

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Date")
        .click();

      H.selectDashboardFilter(H.getDashboardCard(0), "Created At");
      H.selectDashboardFilter(H.getDashboardCard(1), "Created At");

      H.saveDashboard();

      cy.get("@dashcardRequestSpy").should("have.callCount", 4);
    });
  });

  describe("preserve last used value", () => {
    beforeEach(() => {
      const textFilter = createMockParameter({
        name: "Text",
        slug: "string",
        id: "5aefc726",
        type: "string/=",
        sectionId: "string",
      });

      const peopleQuestionDetails = {
        query: { "source-table": PEOPLE_ID, limit: 5 },
      };

      H.createDashboardWithQuestions({
        dashboardDetails: {
          parameters: [textFilter],
        },
        questions: [peopleQuestionDetails],
      }).then(({ dashboard, questions: cards }) => {
        const [peopleCard] = cards;

        H.updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            {
              card_id: peopleCard.id,
              parameter_mappings: [
                {
                  parameter_id: textFilter.id,
                  card_id: peopleCard.id,
                  target: ["dimension", ["field", PEOPLE.NAME, null]],
                },
              ],
            },
          ],
        });

        H.visitDashboard(dashboard.id);

        cy.wrap(dashboard.id).as("dashboardId");
      });
    });

    it("should retain the last used value for a dashboard filter and allow resetting it", () => {
      cy.intercept("GET", "/api/**/items?pinned-state*").as("getPinnedItems");

      H.filterWidget().click();

      H.dashboardParametersPopover().within(() => {
        H.fieldValuesCombobox().type("Antwan Fisher");
        cy.button("Add filter").click();
      });

      H.getDashboardCard()
        .findByText("7750 Michalik Lane")
        .should("be.visible");

      cy.visit("/collection/root");
      cy.wait("@getPinnedItems");

      cy.get<number>("@dashboardId").then((dashboardId) =>
        H.visitDashboard(dashboardId),
      );

      H.filterWidget()
        .findByRole("listitem")
        .should("have.text", "Text:\u00a0Antwan Fisher");

      cy.log("verify filter resetting works");

      H.filterWidget().icon("close").click();
      H.getDashboardCard()
        .findByText("761 Fish Hill Road")
        .should("be.visible");

      cy.log("verify filter value is not specified after reload");

      cy.get<number>("@dashboardId").then((dashboardId) =>
        H.visitDashboard(dashboardId),
      );

      H.getDashboardCard()
        .findByText("761 Fish Hill Road")
        .should("be.visible");
      H.filterWidget().should("not.contain", "Antwan Fisher");
    });
  });

  describe("parameters in heading dashcards", () => {
    const categoryParameter = createMockParameter({
      id: "1b9cd9f1",
      name: "Category",
      type: "string/=",
      slug: "category",
      sectionId: "string",
    });

    const countParameter = createMockParameter({
      id: "88a1257c",
      name: "Count",
      type: "number/<=",
      slug: "count",
      sectionId: "number",
    });

    const categoryFieldRef: ConcreteFieldReference = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    const ordersCountByCategory: StructuredQuestionDetails = {
      display: "bar",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [categoryFieldRef],
      },
    };

    it("should be able to add and use filters", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
        H.editDashboard();
      });

      H.addHeadingWhileEditing("Heading");
      H.setDashCardFilter(1, "Text or Category", undefined, "Category");
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");
      H.dashboardParameterSidebar().button("Done").click();
      H.getDashboardCard(1).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category")
          .should("be.visible");
        // Ensure filters are not draggable
        cy.icon("grabber").should("not.exist");
      });
      H.saveDashboard();

      // Verify the filter doesn't appear in the dashboard header
      H.dashboardParametersContainer().should("not.exist");

      // Verify filtering works
      H.getDashboardCard(1).within(() => {
        H.filterWidget().contains("Category").click();
      });
      H.dashboardParametersPopover().within(() => {
        cy.findByLabelText("Gadget").click();
        cy.button("Add filter").click();
      });
      H.getDashboardCard(0).within(() => {
        cy.findByText("Gadget").should("be.visible");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Gadget");
      });

      // Add a second filter
      H.editDashboard();
      H.setDashCardFilter(1, "Number", undefined, "Count");
      H.selectDashboardFilter(H.getDashboardCard(0), "Count");
      H.saveDashboard();

      // Verify the filter doesn't appear in the dashboard header
      H.dashboardParametersContainer().should("not.exist");

      // Verify filtering works
      H.getDashboardCard(1).within(() => {
        H.filterWidget().contains("Category").should("exist");
        H.filterWidget().contains("Count").click();
      });
      H.dashboardParametersPopover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("6000");
        cy.button("Add filter").click();
      });

      H.getDashboardCard(0)
        .findByText(/No results/)
        .should("exist");

      expectSearchParams({ category: "Gadget", count: "6000" });

      H.getDashboardCard(1).within(() => {
        H.clearFilterWidget(1);
      });

      H.getDashboardCard(0).within(() => {
        cy.findByText("Gadget").should("be.visible");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      expectSearchParams({ category: "Gadget", count: "" });
    });

    it("should duplicate filters when duplicating a dashboard", () => {
      const cardCategoryParameter = createMockParameter({
        id: "c4a7e5d2",
        name: "Card Category",
        type: "string/=",
        slug: "category_2",
        sectionId: "string",
      });

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter, cardCategoryParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            createMockHeadingDashboardCard({
              inline_parameters: [categoryParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            {
              id: dashcard.id,
              row: 1,
              size_x: 12,
              size_y: 6,
              inline_parameters: [cardCategoryParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: checkNotNull(dashcard.card_id),
                  target: [
                    "dimension",
                    categoryFieldRef,
                    { "stage-number": 0 },
                  ],
                },
                {
                  parameter_id: cardCategoryParameter.id,
                  card_id: checkNotNull(dashcard.card_id),
                  target: [
                    "dimension",
                    categoryFieldRef,
                    { "stage-number": 0 },
                  ],
                },
              ],
            },
          ],
        });

        H.visitDashboard(dashcard.dashboard_id);
      });

      H.openDashboardMenu("Duplicate");
      H.modal().button("Duplicate").click();
      H.dashboardHeader()
        .findByText("Test Dashboard - Duplicate")
        .should("exist");

      H.getDashboardCard(1).within(() => {
        H.echartsContainer().within(() => {
          cy.findByText("Doohickey").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Widget").should("be.visible");
        });
      });

      cy.log("Heading filter");
      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").click();
      });
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(1).within(() => {
        H.echartsContainer().within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Doohickey").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      });

      expectSearchParams({ category: "Gadget", category_2: "" });

      cy.log("Question dashcard filter");
      H.getDashboardCard(0).within(() => H.clearFilterWidget());

      H.getDashboardCard(1).within(() => {
        H.echartsContainer().within(() => {
          cy.findByText("Doohickey").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Widget").should("be.visible");
        });

        H.filterWidget().contains("Card Category").click();
      });
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(1).within(() => {
        H.echartsContainer().within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Doohickey").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      });

      expectSearchParams({ category: "", category_2: "Gadget" });
    });

    it("should work correctly in public dashboards", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
      }).then(({ body: dashcard }) => {
        // Dashboards created through the API have numeric ids
        const dashboardId = dashcard.dashboard_id as number;

        H.updateDashboardCards({
          dashboard_id: dashboardId,
          cards: [
            createMockHeadingDashboardCard({
              inline_parameters: [categoryParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            {
              id: dashcard.id,
              row: 1,
              size_x: 24,
              size_y: 6,
              inline_parameters: [countParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: checkNotNull(dashcard.card_id),
                  target: [
                    "dimension",
                    categoryFieldRef,
                    { "stage-number": 0 },
                  ],
                },
                {
                  parameter_id: countParameter.id,
                  card_id: checkNotNull(dashcard.card_id),
                  target: [
                    "dimension",
                    ["field", "count", { "base-type": "type/Integer" }],
                    { "stage-number": 1 },
                  ],
                },
              ],
            },
          ],
        });

        H.visitPublicDashboard(dashboardId);
      });

      H.getDashboardCard(1).within(() => {
        cy.findByText("Doohickey").should("be.visible");
        cy.findByText("Gizmo").should("be.visible");
        cy.findByText("Gadget").should("be.visible");
        cy.findByText("Widget").should("be.visible");
        H.filterWidget().contains("Count").should("be.visible");
      });

      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").click();
      });
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(1).within(() => {
        cy.findByText("Gadget").should("be.visible");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      expectSearchParams({ category: "Gadget", count: "" });

      // Verify filter doesn't show up in the dashboard header
      H.dashboardParametersContainer().should("not.exist");

      cy.findByTestId("embed-frame").then(($el) => {
        expect(H.isScrollableHorizontally($el[0])).to.be.false;
      });
    });

    describe("embedded dashboards", () => {
      it("should work correctly with enabled, disabled and locked parameters", () => {
        const disabledCategoryParameter = createMockParameter({
          ...categoryParameter,
          id: "d15ab1ed",
          name: "Category Disabled",
          slug: "category_disabled",
        });
        const lockedCategoryParameter = createMockParameter({
          ...categoryParameter,
          id: "10c4ed00",
          name: "Category Locked",
          slug: "category_locked",
        });
        const categoryTarget: ParameterTarget = [
          "dimension",
          categoryFieldRef,
          { "stage-number": 0 },
        ];

        H.createQuestionAndDashboard({
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [
              categoryParameter,
              disabledCategoryParameter,
              lockedCategoryParameter,
            ],
            enable_embedding: true,
            embedding_params: {
              [categoryParameter.slug]: "enabled",
              [disabledCategoryParameter.slug]: "disabled",
              [lockedCategoryParameter.slug]: "locked",
            },
          },
        }).then(({ body: dashcard }) => {
          // Dashboards created through the API have numeric ids
          const dashboardId = dashcard.dashboard_id as number;

          H.updateDashboardCards({
            dashboard_id: dashboardId,
            cards: [
              createMockHeadingDashboardCard({
                id: -1,
                row: 0,
                inline_parameters: [categoryParameter.id],
                size_x: 24,
                size_y: 1,
              }),
              {
                id: dashcard.id,
                row: 1,
                size_x: 12,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: categoryParameter.id,
                    card_id: checkNotNull(dashcard.card_id),
                    target: categoryTarget,
                  },
                  {
                    parameter_id: disabledCategoryParameter.id,
                    card_id: checkNotNull(dashcard.card_id),
                    target: categoryTarget,
                  },
                ],
              },
              createMockHeadingDashboardCard({
                id: -2,
                row: 7,
                text: "Hidden filters",
                inline_parameters: [
                  disabledCategoryParameter.id,
                  lockedCategoryParameter.id,
                ],
                size_x: 24,
                size_y: 1,
              }),
              {
                id: -3,
                card_id: checkNotNull(dashcard.card_id),
                row: 8,
                size_x: 12,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: lockedCategoryParameter.id,
                    card_id: checkNotNull(dashcard.card_id),
                    target: categoryTarget,
                  },
                ],
              },
            ],
          });

          H.visitEmbeddedPage({
            resource: { dashboard: dashboardId },
            params: {
              [lockedCategoryParameter.slug]: ["Gadget", "Widget"],
            },
          });
        });

        cy.log("Disabled and locked parameters are hidden");
        H.getDashboardCard(2).within(() => {
          cy.findByText("Hidden filters").should("exist");
          cy.findByText("Category Disabled").should("not.exist");
          cy.findByText("Category Locked").should("not.exist");
        });

        cy.log("A disabled parameter does not filter");
        H.getDashboardCard(1).within(() => {
          cy.findByText("Doohickey").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Widget").should("be.visible");
        });

        cy.log("A locked parameter filters by its token value");
        H.getDashboardCard(3).within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Doohickey").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
        });

        cy.log("An enabled parameter filters");
        H.getDashboardCard(0).within(() => {
          H.filterWidget().contains("Category").click();
        });
        H.popover().within(() => {
          cy.findByText("Gadget").click();
          cy.button("Add filter").click();
        });

        H.getDashboardCard(1).within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Doohickey").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });

        cy.location().should(({ search }) => {
          expect(search).to.eq("?category=Gadget");
        });

        // Verify filter doesn't show up in the dashboard header
        H.dashboardParametersContainer().should("not.exist");
      });
    });
  });

  describe("parameters in question dashcards", () => {
    const categoryFieldRef: ConcreteFieldReference = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    const ordersCountByCategory: StructuredQuestionDetails = {
      display: "bar",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [categoryFieldRef],
      },
    };

    it("should be able to add and use filters", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
        H.editDashboard();
      });

      H.setDashCardFilter(0, "Text or Category", undefined, "Category");
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");
      H.saveDashboard();

      // Verify the filter doesn't appear in the dashboard header
      H.dashboardParametersContainer().should("not.exist");

      // Verify filtering works
      H.getDashboardCard(0).within(() => {
        cy.findByText("Gadget").should("be.visible"); // wait for query
        H.filterWidget().contains("Category").click();
      });
      H.dashboardParametersPopover().within(() => {
        cy.findByLabelText("Gadget").should("exist");
        cy.findByLabelText("Gadget").click();
        cy.button("Add filter").click();
      });
      H.getDashboardCard(0).within(() => {
        cy.findAllByText("Gadget").filter(":visible").should("have.length", 2); // x-axis label + filter
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Gadget");
      });
    });
  });

  describe("moving filters", () => {
    const categoryParameter = createMockParameter({
      id: "1b9cd9f1",
      name: "Category",
      type: "string/=",
      slug: "category",
      sectionId: "string",
    });

    const countParameter = createMockParameter({
      id: "88a1257c",
      name: "Count",
      type: "number/<=",
      slug: "count",
      sectionId: "number",
    });

    const categoryFieldRef: ConcreteFieldReference = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    it("should allow moving filters and undoing moves on a single tab dashboard", () => {
      H.createQuestionAndDashboard({
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
        questionDetails: {
          display: "bar",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [categoryFieldRef],
          },
        },
        cardDetails: {
          inline_parameters: [categoryParameter.id],
        },
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
        H.editDashboard();
      });

      // Wire-up filters with the card
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").click();
      });
      H.selectDashboardFilter(H.getDashboardCard(0), "Count");
      H.dashboardParameterSidebar().button("Done").click();

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");

      cy.log("Undo moving the card filter to the header");
      H.moveDashboardFilter("Top of page");
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category")
          .should("exist");
      });
      H.undo();
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category")
          .should("exist");
      });
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category")
          .should("not.exist");
      });

      cy.log("Undo moving the header filter to the card");
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").click();
      });
      H.moveDashboardFilter("test question");
      H.dashboardParameterSidebar().button("Done").click();
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").should("exist");
      });
      H.undo();
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Count")
          .should("not.exist");
      });
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").should("exist");
      });

      // Move card filter to the header
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.moveDashboardFilter("Top of page");

      H.getDashboardCard(0).findByText("Category").should("not.exist");
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category")
          .should("exist");
      });

      // Move header filter to the card
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").click();
      });
      H.moveDashboardFilter("test question");

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").should("exist");
      });
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Count")
          .should("not.exist");
      });

      // Save and assert changes are applied
      H.saveDashboard();
      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Count").should("exist");
      });
      H.dashboardParametersContainer().within(() => {
        H.filterWidget().contains("Count").should("not.exist");
      });
    });

    it("should provide a way to 'focus' the recently moved filter", () => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };

      H.createDashboardWithTabs({
        parameters: [categoryParameter, countParameter],
        tabs: [TAB_1, TAB_2],
        dashcards: [
          createMockDashboardCard({
            id: -1,
            card_id: ORDERS_BY_YEAR_QUESTION_ID,
            dashboard_tab_id: TAB_1.id,
            size_x: 18,
            size_y: 6,
          }),
          createMockHeadingDashboardCard({
            id: -2,
            dashboard_tab_id: TAB_2.id,
            size_x: 24,
            size_y: 30,
            text: "Tall heading card",
          }),
          createMockHeadingDashboardCard({
            id: -3,
            dashboard_tab_id: TAB_2.id,
            size_x: 24,
            size_y: 2,
            text: "Heading text card",
          }),
        ],
      }).then((dashboard) => {
        H.visitDashboard(dashboard.id);
        H.editDashboard();
      });

      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").click();
      });
      H.moveDashboardFilter("Heading text card", { showFilter: true });

      // Assert tab changed and the filter is in viewport now
      cy.findByRole("tab", { name: "Tab 2" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
      H.getDashboardCard(1).within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").should("exist");
        H.filterWidget({ isEditing: true })
          .contains("Count")
          .isRenderedWithinViewport();
      });

      // Move filter to another card on the same tab
      H.moveDashboardFilter("Tall heading card", { showFilter: true });
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").should("exist");
        H.filterWidget({ isEditing: true })
          .contains("Count")
          .isRenderedWithinViewport();
      });

      // Move filter to top nav and assert the "Show filter" button isn't displayed
      H.moveDashboardFilter("Top of page");
      H.undoToast().should("contain", "Filter moved");
      H.undoToast().button("Show filter").should("not.exist");
    });
  });
});

function isFilterSelected(filter: string, bool: boolean) {
  cy.findByLabelText(filter).should(
    `${bool === false ? "not." : ""}be.checked`,
  );
}
