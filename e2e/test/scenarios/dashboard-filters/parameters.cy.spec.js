const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockTextDashboardCard,
  createMockVirtualCard,
} from "metabase-types/api/mocks";

const { ORDERS_ID, ORDERS, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

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

  it("one filter should search across multiple fields", () => {
    cy.intercept("GET", "/api/dashboard/**").as("dashboard");

    H.createDashboard({ name: "my dash" }).then(({ body: { id } }) => {
      // add the same question twice
      H.updateDashboardCards({
        dashboard_id: id,
        cards,
      });

      H.visitDashboard(id);
    });

    H.editDashboard();

    // add a category filter
    H.setFilter("Text or Category", "Is");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A single value").click();

    // connect it to people.name and product.category
    // (this doesn't make sense to do, but it illustrates the feature)
    H.selectDashboardFilter(H.getDashboardCard(0), "Name");

    H.selectDashboardFilter(H.getDashboardCard(1), "Category");

    H.saveDashboard();

    // confirm that typing searches both fields
    H.filterWidget().contains("Text").click();

    // After typing "Ga", you should see this name!
    H.popover().within(() =>
      cy.findByPlaceholderText("Search the list").type("Ga"),
    );
    cy.wait("@dashboard");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().contains("Gabrielle Considine");

    // Continue typing a "d" and you see "Gadget"
    H.popover()
      .first()
      .within(() => cy.findByPlaceholderText("Search the list").type("d"));
    cy.wait("@dashboard");

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover()
      .last()
      .within(() => {
        cy.findByText("Gadget").click();
      });

    H.popover()
      .first()
      .within(() => {
        cy.button("Add filter").click();
      });

    cy.location("search").should("eq", "?text=Gadget");
    cy.findAllByTestId("dashcard-container").first().should("contain", "0");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("dashcard-container").last().should("contain", "4,939");
  });

  it("should be able to remove parameter (metabase#17933)", () => {
    // Mirrored issue in metabase-enterprise#275

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    const startsWith = {
      name: "Text starts with",
      slug: "text_starts_with",
      id: "1b9cd9f1",
      type: "string/starts-with",
      sectionId: "string",
    };

    const endsWith = {
      name: "Text ends with",
      slug: "text_ends_with",
      id: "88a1257c",
      type: "string/ends-with",
      sectionId: "string",
    };

    const dashboardDetails = {
      parameters: [startsWith, endsWith],
    };

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 8,
              series: [],
              visualization_settings: {},
              parameter_mappings: [
                {
                  parameter_id: startsWith.id,
                  card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PRODUCTS.CATEGORY,
                      {
                        "source-field": ORDERS.PRODUCT_ID,
                      },
                    ],
                  ],
                },
                {
                  parameter_id: endsWith.id,
                  card_id,
                  target: [
                    "dimension",
                    [
                      "field",
                      PRODUCTS.CATEGORY,
                      {
                        "source-field": ORDERS.PRODUCT_ID,
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        });

        H.visitDashboard(dashboard_id);
        H.tableInteractiveHeader("Created At");
      },
    );

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(startsWith.name).click();
    cy.findByPlaceholderText("Enter some text").type("G");
    // Make sure the dropdown list with values is not populated,
    // because it makes no sense for non-exact parameter string operators.
    // See: https://github.com/metabase/metabase/pull/15477
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gizmo").should("not.exist");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gadget").should("not.exist");

    cy.button("Add filter").click();

    cy.location("search").should(
      "eq",
      `?${endsWith.slug}=&${startsWith.slug}=G`,
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("37.65").should("not.exist");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(endsWith.name).click();
    cy.findByPlaceholderText("Enter some text").type("zmo");
    // Make sure the dropdown list with values is not populated,
    // because it makes no sense for non-exact parameter string operators.
    // See: https://github.com/metabase/metabase/pull/15477
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gizmo").should("not.exist");

    cy.button("Add filter").click();

    cy.location("search").should(
      "eq",
      `?${endsWith.slug}=zmo&${startsWith.slug}=G`,
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("52.72").should("not.exist");

    // Remove filter (metabase#17933)
    cy.icon("pencil").click();
    H.filterWidget({ isEditing: true, name: startsWith.name }).click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Remove").click();
    cy.location("search").should("eq", `?${endsWith.slug}=zmo`);

    H.saveDashboard();

    cy.log(
      "There should only be one filter remaining and its value is preserved",
    );

    H.filterWidget().contains(new RegExp(`${endsWith.name}`, "i"));

    cy.location("search").should("eq", `?${endsWith.slug}=zmo`);
  });

  it("should handle mismatch between filter types (metabase#9299, metabase#16181)", () => {
    const questionDetails = {
      name: "16181",
      native: {
        query: "select count(*) from products where {{filter}}",
        "template-tags": {
          filter: {
            id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
            name: "filter",
            "display-name": "Native Filter",
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
            "widget-type": "string/=",
            default: null,
          },
        },
      },
      display: "scalar",
    };

    const matchingFilterType = {
      name: "Text",
      slug: "text",
      id: "d245671f",
      type: "string/=",
      sectionId: "string",
      default: "Gadget",
    };

    const dashboardDetails = {
      parameters: [matchingFilterType],
    };

    H.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 11,
            size_y: 6,
            parameter_mappings: [
              {
                parameter_id: matchingFilterType.id,
                card_id,
                target: [
                  "dimension",
                  ["template-tag", "filter"],
                  { "stage-number": 0 },
                ],
              },
            ],
          },
        ],
      });

      H.visitDashboard(dashboard_id);
      cy.findByTestId("scalar-value").invoke("text").should("eq", "53");

      // Confirm you can't map wrong parameter type the native question's field filter (metabase#16181)
      H.editDashboard();

      H.setFilter("ID");

      cy.findByText(/Add a variable to this question/).should("be.visible");

      // Confirm that the correct parameter type is connected to the native question's field filter
      H.filterWidget({
        isEditing: true,
        name: matchingFilterType.name,
      }).click();

      H.getDashboardCard().within(() => {
        cy.findByText("Column to filter on");
        cy.findByText("Native Filter");
      });

      // Update the underlying question's query
      cy.request("PUT", `/api/card/${card_id}`, {
        dataset_query: {
          type: "native",
          native: {
            query: "select 1",
            "template-tags": {},
          },
          database: SAMPLE_DB_ID,
        },
      });

      // Upon visiting the dashboard again the filter preserves its value
      H.visitDashboard(dashboard_id);

      cy.location("search").should("eq", "?text=Gadget");
      H.filterWidget().contains("Gadget");

      // But the question should display the new value and is not affected by the filter
      cy.findByTestId("scalar-value").invoke("text").should("eq", "1");

      // Confirm that it is not possible to connect filter to the updated question anymore (metabase#9299)
      cy.icon("pencil").click();
      H.filterWidget({
        isEditing: true,
        name: matchingFilterType.name,
      }).click();
      cy.findByText(
        /A text variable in this card can only be connected to a text filter with Is operator/,
      ).should("be.visible");
    });
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

    // Even after we reopen the dropdown, it shouldn't send additional requests for values (metabase#16103)
    cy.get("@fetchAllCategories").should("have.been.calledOnce");

    // As a sanity check, make sure we can deselect the filter by clicking on it
    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      isFilterSelected("Gizmo", false);
    });

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
    cy.findAllByRole("row").should("have.length", 1);

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
    cy.findAllByRole("row").should("have.length", 1);
  });

  describe("when the user does not have self-service data permissions", () => {
    beforeEach(() => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.tableInteractiveHeader("Created At");

      H.editDashboard();
      H.setFilter("ID");

      H.selectDashboardFilter(H.getDashboardCard(), "User ID");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("You're editing this dashboard.").should("not.exist");

      cy.signIn("nodata");
      H.visitDashboard(ORDERS_DASHBOARD_ID);
    });

    it("should not see mapping options", () => {
      cy.icon("pencil").click();
      H.filterWidget({ isEditing: true }).click();

      cy.icon("key");
    });
  });

  it("should be able to use linked filters to limit parameter choices", () => {
    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
      },
    };

    const parameter1Details = {
      id: "1b9cd9f1",
      name: "Category filter",
      slug: "category-filter",
      type: "string/=",
      sectionId: "string",
    };

    const parameter2Details = {
      id: "1b9cd9f2",
      name: "Vendor filter",
      slug: "vendor-filter",
      type: "string/=",
      sectionId: "string",
    };

    const dashboardDetails = {
      parameters: [parameter1Details, parameter2Details],
    };

    H.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
      ({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      },
    );

    H.editDashboard();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameter1Details.name).click();
    H.selectDashboardFilter(H.getDashboardCard(), "Category");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameter2Details.name).click();
    H.selectDashboardFilter(H.getDashboardCard(), "Vendor");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Linked filters").click();
    H.sidebar().findByRole("switch").parent().get("label").click();
    H.saveDashboard();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameter2Details.name).click();
    H.popover().within(() => {
      cy.findByText("Barrows-Johns").should("exist");
      cy.findByText("Balistreri-Ankunding").should("exist");
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameter1Details.name).click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(parameter2Details.name).click();
    H.popover().within(() => {
      cy.findByText("Barrows-Johns").should("exist");
      cy.findByText("Balistreri-Ankunding").should("not.exist");
    });
  });

  describe("when parameters are (dis)connected to dashcards", () => {
    beforeEach(() => {
      createDashboardWithCards({ cards }).then((dashboardId) =>
        H.visitDashboard(dashboardId),
      );

      // create a disconnected filter + a default value
      H.editDashboard();
      H.setFilter("Date picker", "Relative Date");

      H.sidebar().findByText("Default value").next().click();
      H.popover().contains("Previous 7 days").click({ force: true });
      H.saveDashboard();

      const { interceptor } = H.spyRequestFinished("dashcardRequestSpy");

      cy.intercept(
        "POST",
        "/api/dashboard/*/dashcard/*/card/*/query",
        interceptor,
      );
    });

    it("should not fetch dashcard data when filter is disconnected", () => {
      cy.get("@dashcardRequestSpy").should("not.have.been.called");
    });

    it("should fetch dashcard data after save when parameter is mapped", () => {
      // Connect filter to 2 cards
      H.editDashboard();

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Date")
        .click();

      H.selectDashboardFilter(H.getDashboardCard(0), "Created At");
      H.selectDashboardFilter(H.getDashboardCard(1), "Created At");

      H.saveDashboard();

      cy.get("@dashcardRequestSpy").should("have.callCount", 2);
    });

    it("should fetch dashcard data when parameter mapping is removed", () => {
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
    });

    it("should not fetch dashcard data when nothing changed on save", () => {
      H.editDashboard();
      H.saveDashboard({ awaitRequest: false });

      cy.get("@dashcardRequestSpy").should("have.callCount", 0);
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

    it("should retain the last used value for a dashboard filter", () => {
      cy.intercept("GET", "/api/**/items?pinned_state*").as("getPinnedItems");

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

      cy.get("@dashboardId").then((dashboardId) =>
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
    });

    it("should allow resetting last used value", () => {
      H.filterWidget().click();

      H.dashboardParametersPopover().within(() => {
        H.fieldValuesCombobox().type("Antwan Fisher");
        cy.button("Add filter").click();
      });

      H.getDashboardCard()
        .findByText("7750 Michalik Lane")
        .should("be.visible");

      cy.log("reset filter values from url by visiting dashboard by id");

      cy.get("@dashboardId").then((dashboardId) =>
        H.visitDashboard(dashboardId),
      );

      H.filterWidget().icon("close").click();

      H.getDashboardCard()
        .findByText("761 Fish Hill Road")
        .should("be.visible");

      cy.log("verify filter value is not specified after reload");

      cy.get("@dashboardId").then((dashboardId) =>
        H.visitDashboard(dashboardId),
      );

      H.getDashboardCard()
        .findByText("761 Fish Hill Road")
        .should("be.visible");
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

    const categoryFieldRef = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    const ordersCountByCategory = {
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
      H.setDashCardFilter(1, "Text or Category", null, "Category");
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");
      H.getDashboardCard(0).within(() => {
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
      H.setDashCardFilter(1, "Number", null, "Count");
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

      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Gadget&count=6000");
      });

      H.getDashboardCard(1).within(() => {
        H.clearFilterWidget(1);
      });

      H.getDashboardCard(0).within(() => {
        cy.findByText("Gadget").should("be.visible");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Gadget&count=");
      });
    });

    it("should be able to edit filters", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
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
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });

      H.setDashboardParameterName("Count");
      H.setDashboardParameterType("Number");
      H.setDashboardParameterOperator("Less than or equal to");

      // Set default value
      H.dashboardParameterSidebar().findByLabelText("Default value").click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("4000");
        cy.button("Add filter").click();
      });

      // Connect to the card
      H.selectDashboardFilter(H.getDashboardCard(1), "Count");

      H.dashboardParameterSidebar().button("Done").click();
      H.saveDashboard();

      H.getDashboardCard(0).within(() => {
        H.filterWidget().within(() => {
          // exact: false so that it matches "Count\u00a0" (with a non-breaking space)
          cy.findByText("Count", { exact: false }).should("exist");
          cy.findByText("4,000").should("exist");
        });
        cy.findByText("Category").should("not.exist");
      });

      H.getDashboardCard(1).within(() => {
        cy.findByText("Doohickey").should("be.visible");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      cy.location().should(({ search }) => {
        expect(search).to.eq("?count=4000");
      });
    });

    it("should remove filters correctly", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            createMockHeadingDashboardCard({
              inline_parameters: [categoryParameter.id, countParameter.id],
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
                  card_id: dashcard.card_id,
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

      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").should("exist");

        // Verify we're hiding filters that are not linked to any cards
        cy.findByText("Count").should("not.exist");
      });

      H.editDashboard();

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").click();
      });
      H.dashboardParameterSidebar().button("Remove").click();

      H.getDashboardCard(0).within(() => {
        cy.findByDisplayValue("Heading Text").should("exist");
        cy.findByText("Count").should("not.exist");

        H.filterWidget({ isEditing: true }).contains("Category").click();
      });

      H.dashboardParameterSidebar().button("Remove").click();

      H.saveDashboard();
      cy.wait("@updateDashboard").then((xhr) => {
        const { body: dashboard } = xhr.request;
        expect(dashboard.parameters).to.have.length(0);
        dashboard.dashcards.forEach((dashcard) => {
          expect(dashcard.inline_parameters).to.have.length(0);
          expect(dashcard.parameter_mappings).to.have.length(0);
        });
      });

      H.getDashboardCard(0).within(() => {
        cy.findByText("Heading Text").should("exist");
        cy.findByText("Count").should("not.exist");
        cy.findByText("Category").should("not.exist");
      });
    });

    it("should remove filters when removing a dashcard", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
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
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });

      H.getDashboardCard(0).findByText("Heading Text").should("exist");
      H.removeDashboardCard(0);
      H.saveDashboard();

      cy.wait("@updateDashboard").then((xhr) => {
        const { body: dashboard } = xhr.request;
        expect(dashboard.parameters).to.have.length(0);
        dashboard.dashcards.forEach((dashcard) => {
          expect(dashcard.inline_parameters).to.have.length(0);
          expect(dashcard.parameter_mappings).to.have.length(0);
        });
      });
    });

    it("should not use inline filters for auto-wiring", () => {
      H.createQuestion({
        name: "Average total by category",
        display: "bar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [categoryFieldRef],
        },
      });

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            createMockHeadingDashboardCard({
              inline_parameters: [categoryParameter.id, countParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            {
              id: dashcard.id,
              row: 1,
              size_x: 12,
              size_y: 6,
            },
          ],
        });
        H.visitDashboard(dashcard.dashboard_id);
        H.editDashboard();
      });

      // Connect Category filter to first card
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.selectDashboardFilter(H.getDashboardCard(1), "Category");
      H.dashboardParameterSidebar().button("Done").click();

      // Add the second card with category dimension
      H.openQuestionsSidebar();
      H.sidebar().findByText("Average total by category").click();
      H.getDashboardCard(2).findByText("Average of Total").should("exist");

      // Verify filter isn't auto-wired and there's no auto-wiring toast
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.getDashboardCard(2)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("not.exist");
      H.undoToast().should("not.exist");

      // Verify filter isn't auto-wired after mapping it to a card
      H.disconnectDashboardFilter(H.getDashboardCard(1), "Category");
      H.selectDashboardFilter(H.getDashboardCard(1), "Category");
      H.getDashboardCard(2)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("not.exist");
      H.undoToast().should("not.exist");
    });

    it("should duplicate filters when duplicating a dashcard", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
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
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });

      H.getDashboardCard(0)
        .realHover({ scrollBehavior: "bottom" })
        .findByLabelText("Duplicate")
        .click();

      H.getDashboardCard(2).within(() => {
        cy.findByDisplayValue("Heading Text").should("exist");
        H.filterWidget({ isEditing: true }).contains("Category 1").click();
      });

      // Ensure the filter isn't mapped to the question by default
      H.getDashboardCard(1)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("not.exist");

      // Connect the filter to the question
      H.selectDashboardFilter(H.getDashboardCard(1), "Category");

      H.saveDashboard();
      cy.wait("@updateDashboard").then((xhr) => {
        const { body: dashboard } = xhr.request;
        expect(dashboard.parameters).to.have.length(2);
      });

      // Ensure filters work independently
      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").click();
      });
      H.popover().within(() => {
        cy.findByText("Doohickey").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(1).within(() => {
        cy.findByText("Doohickey").should("exist");
        cy.findByText("Gizmo").should("not.exist");
      });
      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Doohickey&category_1=");
      });

      H.getDashboardCard(2).within(() => {
        H.filterWidget().contains("Category 1").click();
      });
      H.popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(1)
        .findByText(/No results/)
        .should("exist");
      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Doohickey&category_1=Gizmo");
      });

      H.getDashboardCard(0).within(() => H.clearFilterWidget());

      H.getDashboardCard(1).within(() => {
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gizmo").should("exist");
      });
      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=&category_1=Gizmo");
      });
    });

    it("should duplicate filters when duplicating a dashboard", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
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
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        cy.findByText("Doohickey").should("be.visible");
        cy.findByText("Gizmo").should("be.visible");
        cy.findByText("Gadget").should("be.visible");
        cy.findByText("Widget").should("be.visible");
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

      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Gadget");
      });
    });

    it("should correctly undo dashcard removal (VIZ-1236)", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
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
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });

      H.removeDashboardCard(0);
      H.getDashboardCard().findByText("test question").should("exist");

      H.undo();

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.getDashboardCard(1)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("exist");
    });

    it("should not display a parameter widget if there are no linked with it cards after a text card variable is removed (UXW-751)", () => {
      H.createDashboard({
        parameters: [categoryParameter, countParameter],
      }).then(({ body: dashboard }) => {
        const virtualCard = createMockVirtualCard({
          display: "text",
        });

        H.updateDashboardCards({
          dashboard_id: dashboard.id,
          cards: [
            createMockTextDashboardCard({
              card: virtualCard,
              text: "Value {{VAR1}} and {{VAR2}}",
              size_x: 3,
              size_y: 3,
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: virtualCard.id,
                  target: ["text-tag", "VAR1"],
                },
                {
                  parameter_id: countParameter.id,
                  card_id: virtualCard.id,
                  target: ["text-tag", "VAR2"],
                },
              ],
            }),
          ],
        });
        H.visitDashboard(dashboard.id);
      });

      H.filterWidget({ isEditing: false }).contains("Category").should("exist");
      H.filterWidget({ isEditing: false }).contains("Category").should("exist");

      H.editDashboard();

      H.getDashboardCard(0).click();
      H.getDashboardCard(0).within(() => {
        cy.get("textarea").clear();
        cy.get("textarea").type("Value {{}{{}VAR1}}");
      });

      H.saveDashboard();

      H.filterWidget({ isEditing: false }).contains("Category").should("exist");
      cy.findByTestId("parameter-widget").contains("Count").should("not.exist");

      H.editDashboard();

      H.getDashboardCard(0).click();
      H.getDashboardCard(0).within(() => {
        cy.get("textarea").clear();
        cy.get("textarea").type("Value null");
      });

      H.saveDashboard();

      cy.findByTestId("parameter-widget").should("not.exist");
    });

    it("should work correctly in public dashboards", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
      }).then(({ body: dashcard }) => {
        const dashboardId = dashcard.dashboard_id;

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
                  card_id: dashcard.card_id,
                  target: [
                    "dimension",
                    categoryFieldRef,
                    { "stage-number": 0 },
                  ],
                },
                {
                  parameter_id: countParameter.id,
                  card_id: ORDERS_BY_YEAR_QUESTION_ID,
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

      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Gadget&count=");
      });

      // Verify filter doesn't show up in the dashboard header
      H.dashboardParametersContainer().should("not.exist");

      cy.findByTestId("embed-frame").then(($el) => {
        expect(H.isScrollableHorizontally($el[0])).to.be.false;
      });
    });

    [
      { movedCardType: "heading", dashcardIndex: 0 },
      { movedCardType: "question", dashcardIndex: 1 },
    ].forEach(({ movedCardType, dashcardIndex }) => {
      it(`should correctly unwire inline parameters when moving a ${movedCardType} card to another tab`, () => {
        cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

        const TAB_1 = { id: 1, name: "Tab 1" };
        const TAB_2 = { id: 2, name: "Tab 2" };

        H.createDashboardWithTabs({
          parameters: [categoryParameter, countParameter],
          tabs: [TAB_1, TAB_2],
          dashcards: [
            createMockHeadingDashboardCard({
              id: -1,
              dashboard_tab_id: TAB_1.id,
              inline_parameters: [countParameter.id],
              size_x: 24,
              size_y: 1,
            }),
            createMockDashboardCard({
              id: -2,
              card_id: ORDERS_BY_YEAR_QUESTION_ID,
              dashboard_tab_id: TAB_1.id,
              parameter_mappings: [
                {
                  parameter_id: countParameter.id,
                  card_id: ORDERS_BY_YEAR_QUESTION_ID,
                  target: [
                    "dimension",
                    ["field", "count", { "base-type": "type/Integer" }],
                    { "stage-number": 1 },
                  ],
                },
                {
                  parameter_id: categoryParameter.id,
                  card_id: ORDERS_BY_YEAR_QUESTION_ID,
                  target: [
                    "dimension",
                    categoryFieldRef,
                    { "stage-number": 0 },
                  ],
                },
              ],
              row: 1,
              size_x: 12,
              size_y: 6,
            }),
          ],
        }).then((dashboard) => {
          H.visitDashboard(dashboard.id);
          H.editDashboard();
        });

        H.moveDashCardToTab({ dashcardIndex, tabName: TAB_2.name });
        H.saveDashboard();

        cy.wait("@updateDashboard").then((xhr) => {
          const { body: dashboard } = xhr.request;
          const questionDashcard = dashboard.dashcards.find(
            (dc) => !!dc.card_id,
          );

          // Ensure inline parameter is unwired, but not the header one
          expect(questionDashcard.parameter_mappings).to.have.length(1);
          expect(questionDashcard.parameter_mappings[0].parameter_id).to.eq(
            categoryParameter.id,
          );
        });
      });
    });

    describe("embedded dashboards", () => {
      it("should work correctly when parameter is enabled", () => {
        H.createQuestionAndDashboard({
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter],
            enable_embedding: true,
            embedding_params: {
              [categoryParameter.slug]: "enabled",
            },
          },
        }).then(({ body: dashcard }) => {
          const dashboardId = dashcard.dashboard_id;

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
                size_x: 12,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: categoryParameter.id,
                    card_id: dashcard.card_id,
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

          H.visitEmbeddedPage({
            resource: { dashboard: dashboardId },
            params: {},
          });
        });

        H.getDashboardCard(1).within(() => {
          cy.findByText("Doohickey").should("be.visible");
          cy.findByText("Gizmo").should("be.visible");
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Widget").should("be.visible");
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

        cy.location().should(({ search }) => {
          expect(search).to.eq("?category=Gadget");
        });

        // Verify filter doesn't show up in the dashboard header
        H.dashboardParametersContainer().should("not.exist");
      });

      it("should work correctly when parameter is disabled", () => {
        H.createQuestionAndDashboard({
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter],
            enable_embedding: true,
            embedding_params: {
              [categoryParameter.slug]: "disabled",
            },
          },
        }).then(({ body: dashcard }) => {
          const dashboardId = dashcard.dashboard_id;

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
                size_x: 12,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: categoryParameter.id,
                    card_id: dashcard.card_id,
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

          H.visitEmbeddedPage({
            resource: { dashboard: dashboardId },
            params: {},
          });
        });

        H.getDashboardCard(0).within(() => {
          cy.findByText("Heading Text").should("exist");
          cy.findByText("Category").should("not.exist");
        });
      });

      it("should work correctly when parameter is locked", () => {
        H.createQuestionAndDashboard({
          questionDetails: ordersCountByCategory,
          dashboardDetails: {
            parameters: [categoryParameter],
            enable_embedding: true,
            embedding_params: {
              [categoryParameter.slug]: "locked",
            },
          },
        }).then(({ body: dashcard }) => {
          const dashboardId = dashcard.dashboard_id;

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
                size_x: 12,
                size_y: 6,
                parameter_mappings: [
                  {
                    parameter_id: categoryParameter.id,
                    card_id: dashcard.card_id,
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

          H.visitEmbeddedPage({
            resource: { dashboard: dashboardId },
            params: {
              [categoryParameter.slug]: ["Gadget", "Widget"],
            },
          });
        });

        H.getDashboardCard(0).within(() => {
          cy.findByText("Heading Text").should("exist");
          cy.findByText("Category").should("not.exist");
        });

        H.getDashboardCard(1).within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Widget").should("be.visible");
          cy.findByText("Doohickey").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
        });
      });
    });
  });

  describe("parameters in question dashcards", () => {
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

    const categoryFieldRef = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    const ordersCountByCategory = {
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

      H.setDashCardFilter(0, "Text or Category", null, "Category");
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

    it("should prefer more granular filter", () => {
      const headerCategoryParameter = createMockParameter({
        ...categoryParameter,
        id: "header-category",
        name: "Header Category",
        slug: "header-category",
      });

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [headerCategoryParameter, categoryParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              inline_parameters: [categoryParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
                  target: [
                    "dimension",
                    categoryFieldRef,
                    { "stage-number": 0 },
                  ],
                },
                {
                  parameter_id: headerCategoryParameter.id,
                  card_id: dashcard.card_id,
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

      H.getDashboardCard(0).within(() => {
        cy.findByText("Doohickey").should("exist");
        cy.findByText("Gizmo").should("exist");
        cy.findByText("Gadget").should("exist");
        cy.findByText("Widget").should("exist");
      });

      // Update header filter (Doohickey + Gizmo)
      H.dashboardParametersContainer().findByText("Header Category").click();
      H.popover().within(() => {
        cy.findByLabelText("Doohickey").click();
        cy.findByLabelText("Gizmo").click();
        cy.button("Add filter").click();
      });
      H.getDashboardCard(0).within(() => {
        cy.findByText("Doohickey").should("exist");
        cy.findByText("Gizmo").should("exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      // Update card filter (Gadget) and verify no results
      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").click();
      });
      H.popover().within(() => {
        cy.findByLabelText("Gadget").click();
        cy.button("Add filter").click();
      });
      H.getDashboardCard(0)
        .findByText(/No results/)
        .should("exist");

      // Update card filter (Gizmo) and verify 1 result
      H.getDashboardCard(0).within(() => H.filterWidget().click());
      H.popover().within(() => {
        cy.findByLabelText("Gadget").click(); // unselect
        cy.findByLabelText("Gizmo").click();
        cy.button("Update filter").click();
      });
      H.getDashboardCard(0).within(() => {
        cy.findAllByText("Gizmo").filter(":visible").should("exist");
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      // Update header filter, verify no changes
      H.dashboardParametersContainer().within(() => H.filterWidget().click());
      H.popover().within(() => {
        cy.findByLabelText("Gadget").click();
        cy.button("Update filter").click();
      });
      H.dashboardParametersContainer()
        .findByText("3 selections")
        .should("exist");
      H.getDashboardCard(0).within(() => {
        cy.findAllByText("Gizmo").filter(":visible").should("have.length", 2); // x-axis label + filter
        cy.findByText("Doohickey").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });
    });

    it("should be able to edit filters", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              inline_parameters: [categoryParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });

      H.setDashboardParameterName("Count");
      H.setDashboardParameterType("Number");
      H.setDashboardParameterOperator("Less than or equal to");

      // Set default value
      H.dashboardParameterSidebar().findByLabelText("Default value").click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("4000");
        cy.button("Add filter").click();
      });

      // Connect to the card
      H.selectDashboardFilter(H.getDashboardCard(0), "Count");

      H.dashboardParameterSidebar().button("Done").click();
      H.saveDashboard();

      H.getDashboardCard(0).within(() => {
        cy.findByText("Count").should("exist");
        cy.findAllByText("4,000").filter(":visible").should("have.length", 2); // y-axis label + filter
        cy.findByText("Category").should("not.exist");

        cy.findByText("Doohickey").should("be.visible");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Gadget").should("not.exist");
        cy.findByText("Widget").should("not.exist");
      });

      cy.location().should(({ search }) => {
        expect(search).to.eq("?count=4000");
      });
    });

    it("should remove filters correctly", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              size_x: 18,
              inline_parameters: [categoryParameter.id, countParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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

      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").should("exist");

        // Verify we're hiding filters that are not linked to any cards
        cy.findByText("Count").should("not.exist");
      });

      H.editDashboard();

      H.getDashboardCard(0)
        .findAllByText("Count")
        .filter(":visible")
        .first()
        .click();
      H.dashboardParameterSidebar().button("Remove").click();

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Count")
          .should("not.exist");
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });

      H.dashboardParameterSidebar().button("Remove").click();

      H.saveDashboard();
      cy.wait("@updateDashboard").then((xhr) => {
        const { body: dashboard } = xhr.request;
        expect(dashboard.parameters).to.have.length(0);
        dashboard.dashcards.forEach((dashcard) => {
          expect(dashcard.inline_parameters).to.have.length(0);
          expect(dashcard.parameter_mappings).to.have.length(0);
        });
      });

      H.getDashboardCard(0).within(() => {
        cy.findByText("Category").should("not.exist");
        cy.findAllByText("Count").should("have.length", 1); // y-axis label
      });
    });

    it("should remove filters when removing a dashcard", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              inline_parameters: [categoryParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });

      H.getDashboardCard(0).findByText("Doohickey").should("exist");
      H.removeDashboardCard(0);
      H.saveDashboard();

      cy.wait("@updateDashboard").then((xhr) => {
        const { body: dashboard } = xhr.request;
        expect(dashboard.parameters).to.have.length(0);
        dashboard.dashcards.forEach((dashcard) => {
          expect(dashcard.inline_parameters).to.have.length(0);
          expect(dashcard.parameter_mappings).to.have.length(0);
        });
      });
    });

    it("should not use inline filters for auto-wiring", () => {
      H.createQuestion({
        name: "Average total by category",
        display: "bar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
          breakout: [categoryFieldRef],
        },
      });

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter, countParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              inline_parameters: [categoryParameter.id, countParameter.id],
              size_x: 24,
              size_y: 4,
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });

      // Add a second card with category dimension
      H.openQuestionsSidebar();
      H.sidebar().findByText("Average total by category").click();
      H.getDashboardCard(1).findByText("Average of Total").should("exist");

      // Verify filter isn't auto-wired and there's no auto-wiring toast
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.getDashboardCard(1)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("not.exist");
      H.undoToast().should("not.exist");

      // Verify filter isn't auto-wired after mapping it to a card
      H.getDashboardCard(0).click(); // click to stop dragging a card
      H.disconnectDashboardFilter(H.getDashboardCard(0), "Category");
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");
      H.getDashboardCard(1)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("not.exist");
      H.undoToast().should("not.exist");
    });

    it("should duplicate filters and mappings when duplicating a dashcard", () => {
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          auto_apply_filters: false,
          parameters: [categoryParameter, countParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              inline_parameters: [categoryParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();
      });
      cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");

      // Connect the Count filter in the header to first card
      H.editingDashboardParametersContainer().findByText("Count").click();
      H.selectDashboardFilter(H.getDashboardCard(0), "Count");
      H.dashboardParameterSidebar().button("Done").click();

      H.getDashboardCard(0)
        .realHover({ scrollBehavior: "bottom" })
        .findByLabelText("Duplicate")
        .click();

      H.getDashboardCard(1).within(() => {
        cy.findByTestId("chart-container").should("exist");
      });

      H.getDashboardCard(1).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category 1")
          .should("exist")
          .click();
      });

      // Verify the Count filter is connected to a new card
      H.editingDashboardParametersContainer().findByText("Count").click();
      H.getDashboardCard(1)
        .findByTestId("parameter-mapper-container")
        .findByText(/Count/)
        .should("exist");
      H.dashboardParameterSidebar().button("Done").click();

      // Verify first card's filter isn't connected to a new card
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category")
          .should("exist")
          .click();
      });
      H.getDashboardCard(1)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("not.exist");
      H.dashboardParameterSidebar().button("Done").click();

      // Verify new card's filter is connected to the new card
      H.getDashboardCard(1).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category 1")
          .should("exist")
          .click();
      });
      H.getDashboardCard(1)
        .findByTestId("parameter-mapper-container")
        .findByText(/Category/)
        .should("exist");

      H.saveDashboard();

      cy.wait("@updateDashboard").then((xhr) => {
        const { body: dashboard } = xhr.request;
        expect(dashboard.parameters).to.have.length(3);
        dashboard.dashcards.forEach((dashcard) => {
          expect(dashcard.inline_parameters).to.have.length(1);
          expect(dashcard.parameter_mappings).to.have.length(2);
        });
      });

      // Verify filtering works independently
      H.dashboardParametersContainer().findByText("Count").click();
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("5000");
        cy.button("Add filter").click();
      });

      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").click();
      });
      H.popover().within(() => {
        cy.findByLabelText("Widget").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(1).within(() => {
        H.filterWidget().contains("Category 1").click();
      });
      H.popover().within(() => {
        cy.findByLabelText("Doohickey").click();
        cy.button("Add filter").click();
      });

      H.applyFilterButton().click();

      H.getDashboardCard(0)
        .findByText(/No results/)
        .should("exist");
      H.getDashboardCard(1).within(() => {
        H.echartsContainer().within(() => {
          cy.findByText("Doohickey").should("exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Gadget").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      });

      cy.location().should(({ search }) => {
        expect(search).to.eq(
          "?category=Widget&category_1=Doohickey&count=5000",
        );
      });
    });

    it("should duplicate filters when duplicating a dashboard", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryParameter],
        },
      }).then(({ body: dashcard }) => {
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              inline_parameters: [categoryParameter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryParameter.id,
                  card_id: dashcard.card_id,
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

      H.getDashboardCard(0).within(() => {
        cy.findByText("Doohickey").should("be.visible");
        cy.findByText("Gizmo").should("be.visible");
        cy.findByText("Gadget").should("be.visible");
        cy.findByText("Widget").should("be.visible");

        H.filterWidget().contains("Category").click();
      });
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(0).within(() => {
        H.echartsContainer().within(() => {
          cy.findByText("Gadget").should("be.visible");
          cy.findByText("Doohickey").should("not.exist");
          cy.findByText("Gizmo").should("not.exist");
          cy.findByText("Widget").should("not.exist");
        });
      });

      cy.location().should(({ search }) => {
        expect(search).to.eq("?category=Gadget");
      });
    });

    it("should not allow connecting inline parameters to cards on a different tab", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
      }).then(({ body: dashcard }) => {
        H.visitDashboard(dashcard.dashboard_id);
        H.editDashboard();

        // Add a second card
        H.openQuestionsSidebar();
        H.sidebar().findByText("Orders, Count").click();

        // Add a second tab
        H.createNewTab();
        H.goToTab("Tab 2");

        // Add a question to the second tab
        H.sidebar().findByText("Orders, Count").click();

        H.goToTab("Tab 1");

        // Add a filter to the first card
        H.setDashCardFilter(0, "Text or Category", null, "Category");
        H.selectDashboardFilter(H.getDashboardCard(0), "Category");

        H.goToTab("Tab 2");

        // Ensure the filter can't be connected to the second card
        H.getDashboardCard(0)
          .findByText("The selected filter is on another tab.")
          .should("be.visible");
      });
    });

    it("should allow connecting inline parameters only to their own card", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
      }).then(({ body: dashcard }) => {
        H.visitDashboard(dashcard.dashboard_id);
        H.editDashboard();

        // Add a second card
        H.openQuestionsSidebar();
        H.sidebar().findByText("Orders, Count").click();
        H.getDashboardCard(1).findByText("Count").should("exist");

        // Add a filter to the first card
        H.setDashCardFilter(0, "Text or Category", null, "Category");
        H.selectDashboardFilter(H.getDashboardCard(0), "Category");

        // Ensure the filter can't be connected to the second card
        H.getDashboardCard(1)
          .findByText("This filter can only connect to its own card.")
          .should("be.visible");

        // Disconnect the filter from the first card
        H.sidebar().findByText("Disconnect from card").click();

        // Ensure it still can't be connected to the second card
        H.getDashboardCard(1)
          .findByText("This filter can only connect to its own card.")
          .should("be.visible");
      });
    });

    it("should show all inline parameters when editing one parameter mapping", () => {
      const categoryFilter = createMockParameter({
        id: "category123",
        name: "Category",
        type: "string/=",
        slug: "category",
        sectionId: "string",
      });

      const countFilter = createMockParameter({
        id: "count456",
        name: "Count",
        type: "number/=",
        slug: "count",
        sectionId: "number",
      });

      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
        dashboardDetails: {
          parameters: [categoryFilter, countFilter],
        },
      }).then(({ body: dashcard }) => {
        // Update the dashcard to have inline parameters
        H.updateDashboardCards({
          dashboard_id: dashcard.dashboard_id,
          cards: [
            {
              id: dashcard.id,
              inline_parameters: [categoryFilter.id, countFilter.id],
              parameter_mappings: [
                {
                  parameter_id: categoryFilter.id,
                  card_id: dashcard.card_id,
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
        H.editDashboard();

        // Both filters should be visible
        H.getDashboardCard(0).within(() => {
          H.filterWidget({ isEditing: true, name: "Category" }).should(
            "be.visible",
          );
          H.filterWidget({ isEditing: true, name: "Count" }).should(
            "be.visible",
          );
        });

        // Click on Category filter to open its mapping sidebar
        H.getDashboardCard(0).within(() => {
          H.filterWidget({ isEditing: true, name: "Category" }).click();
        });

        // Verify the sidebar opened for Category parameter
        H.sidebar().findByLabelText("Label").should("have.value", "Category");

        // Both filters should still be visible during mapping mode
        H.getDashboardCard(0).within(() => {
          H.filterWidget({ isEditing: true, name: "Category" }).should(
            "be.visible",
          );
          H.filterWidget({ isEditing: true, name: "Count" }).should(
            "be.visible",
          );
        });

        // Should be able to click on Count filter while Category mapping is open
        H.getDashboardCard(0).within(() => {
          H.filterWidget({ isEditing: true, name: "Count" }).click();
        });

        // The sidebar should now show Count parameter settings
        H.sidebar().findByLabelText("Label").should("have.value", "Count");

        // Both filters should still be visible
        H.getDashboardCard(0).within(() => {
          H.filterWidget({ isEditing: true, name: "Category" }).should(
            "be.visible",
          );
          H.filterWidget({ isEditing: true, name: "Count" }).should(
            "be.visible",
          );
        });
      });
    });

    it("should not show add filter button for users with no data editing permissions", () => {
      H.createQuestionAndDashboard({
        questionDetails: ordersCountByCategory,
      }).then(({ body: { dashboard_id } }) => {
        cy.signIn("nodata");
        H.visitDashboard(dashboard_id);
        H.editDashboard();

        H.getDashboardCard(0)
          .realHover()
          .findByTestId("dashboardcard-actions-panel")
          .should("be.visible");

        // Ensure the "Add a filter" button is not present
        H.getDashboardCard(0)
          .findByLabelText("Add a filter")
          .should("not.exist");
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

    const categoryFieldRef = [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID },
    ];

    it("should allow moving filters on a single tab dashboard", () => {
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

      // Move card filter to the header
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

    it("should allow moving filters on a dashboard with tabs", () => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };

      H.createDashboardWithTabs({
        parameters: [categoryParameter, countParameter],
        tabs: [TAB_1, TAB_2],
        dashcards: [
          createMockHeadingDashboardCard({
            id: -1,
            dashboard_tab_id: TAB_2.id,
            inline_parameters: [categoryParameter.id],
            size_x: 24,
            size_y: 2,
          }),
          createMockDashboardCard({
            id: -2,
            card_id: ORDERS_BY_YEAR_QUESTION_ID,
            dashboard_tab_id: TAB_1.id,
            inline_parameters: [countParameter.id],
            parameter_mappings: [
              {
                parameter_id: countParameter.id,
                card_id: ORDERS_BY_YEAR_QUESTION_ID,
                target: [
                  "dimension",
                  ["field", "count", { "base-type": "type/Integer" }],
                  { "stage-number": 1 },
                ],
              },
            ],
            row: 1,
            size_x: 18,
            size_y: 6,
          }),
        ],
      }).then((dashboard) => {
        H.visitDashboard(dashboard.id);
        H.editDashboard();
      });

      // Move filter from tab 1 to tab 2
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").click();
      });

      H.moveDashboardFilter("Heading Text");
      H.dashboardParameterSidebar().button("Done").click();

      H.getDashboardCard(0)
        .findByTestId("editing-parameter-widget")
        .should("not.exist");
      H.editingDashboardParametersContainer().should("not.exist");

      // Move filter from tab 2 to tab 1
      H.goToTab("Tab 2");

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").should("exist");
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });

      H.moveDashboardFilter(/Orders, Count/);
      H.dashboardParameterSidebar().button("Done").click();

      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Category")
          .should("not.exist");
      });
      H.editingDashboardParametersContainer().should("not.exist");

      H.goToTab("Tab 1");
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");
      H.dashboardParameterSidebar().button("Done").click();

      // Save and assert changes are applied
      H.saveDashboard();
      H.getDashboardCard(0).within(() => {
        H.filterWidget().contains("Category").should("exist");
        H.filterWidget().contains("Count").should("not.exist");
      });
    });

    it("should allow undoing a move", () => {
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
          size_x: 18,
        },
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
        H.editDashboard();
      });

      // Move card filter to the header
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true }).contains("Category").click();
      });
      H.dashboardParameterSidebar()
        .findByPlaceholderText("Move filter")
        .click();
      H.popover().findByText("Top of page").click();

      // Undo
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

      // Move header filter to the card
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").click();
      });
      H.dashboardParameterSidebar()
        .findByPlaceholderText("Move filter")
        .click();
      H.popover().findByText("test question").click();
      H.dashboardParameterSidebar().button("Done").click();

      // Undo
      H.undo();
      H.getDashboardCard(0).within(() => {
        H.filterWidget({ isEditing: true })
          .contains("Count")
          .should("not.exist");
      });
      H.editingDashboardParametersContainer().within(() => {
        H.filterWidget({ isEditing: true }).contains("Count").should("exist");
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
      H.undoToast().button("Show filter").should("not.exist");
    });
  });
});

describe("scenarios > dashboard > parameters", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should track dashboard_filter_created event when adding a filter", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    // Ensure tracking is triggered for question dashcard parameters
    H.setDashCardFilter(0, "Text or Category", null, "Category");
    H.selectDashboardFilter(H.getDashboardCard(0), "Category");

    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_created",
      triggered_from: "table",
      event_detail: "string",
      target_id: ORDERS_DASHBOARD_ID,
    });

    H.dashboardParameterSidebar().button("Done").click();

    // Ensure tracking is triggered for heading dashcard parameters
    H.addHeadingWhileEditing("Heading Text");
    H.setDashCardFilter(1, "Text or Category", null, "Category 2");

    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_created",
      triggered_from: "heading",
      event_detail: "string",
      target_id: ORDERS_DASHBOARD_ID,
    });

    H.dashboardParameterSidebar().button("Done").click();

    // Ensure tracking is triggered for dashboard parameters
    H.setFilter("ID");

    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_filter_created",
      triggered_from: null,
      event_detail: "id",
      target_id: ORDERS_DASHBOARD_ID,
    });
  });

  it("should track dashboard_filter_moved event when moving a filter", () => {
    H.createQuestionAndDashboard({
      dashboardDetails: {
        parameters: [
          createMockParameter({
            id: "1b9cd9f1",
            name: "Category",
            type: "string/=",
            slug: "category",
            sectionId: "string",
          }),
        ],
      },
      questionDetails: {
        display: "bar",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
      },
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
      H.editDashboard();
      H.addHeadingWhileEditing("heading card");
      cy.wrap(dashboard_id).as("dashboardId");
    });

    H.editingDashboardParametersContainer().within(() => {
      H.filterWidget({ isEditing: true }).contains("Category").click();
    });

    cy.get("@dashboardId").then((dashboardId) => {
      H.moveDashboardFilter("test question");
      H.expectUnstructuredSnowplowEvent({
        event: "dashboard_filter_moved",
        triggered_from: null,
        event_detail: "bar",
        target_id: dashboardId,
      });

      H.moveDashboardFilter("heading card");
      H.expectUnstructuredSnowplowEvent({
        event: "dashboard_filter_moved",
        triggered_from: "bar",
        event_detail: "heading",
        target_id: dashboardId,
      });

      H.moveDashboardFilter("Top of page");
      H.expectUnstructuredSnowplowEvent({
        event: "dashboard_filter_moved",
        triggered_from: "heading",
        event_detail: null,
        target_id: dashboardId,
      });
    });
  });
});

function isFilterSelected(filter, bool) {
  cy.findByLabelText(filter).should(
    `${bool === false ? "not." : ""}be.checked`,
  );
}

function createDashboardWithCards({
  dashboardName = "my dash",
  cards = [],
} = {}) {
  return H.createDashboard({ name: dashboardName }).then(({ body: { id } }) => {
    H.updateDashboardCards({
      dashboard_id: id,
      cards,
    });

    cy.wrap(id).as("dashboardId");
  });
}
