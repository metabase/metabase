import {
  popover,
  restore,
  selectDashboardFilter,
  editDashboard,
  showDashboardCardActions,
  filterWidget,
  sidebar,
  modal,
  visitDashboard,
  appBar,
  rightSidebar,
  getDashboardCardMenu,
  addOrUpdateDashboardCard,
  openQuestionsSidebar,
  describeWithSnowplow,
  resetSnowplow,
  enableTracking,
  expectNoBadSnowplowEvents,
  expectGoodSnowplowEvent,
  closeNavigationSidebar,
  saveDashboard,
  queryBuilderHeader,
  removeDashboardCard,
  getDashboardCards,
  toggleDashboardInfoSidebar,
  dashboardHeader,
  openProductsTable,
  updateDashboardCards,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("create", () => {
    it("new dashboard UI flow", { tags: "@smoke" }, () => {
      cy.intercept("POST", "/api/dashboard").as("createDashboard");
      cy.intercept("POST", "/api/card").as("createQuestion");

      const dashboardName = "Dash A";
      const dashboardDescription = "Fresh new dashboard";
      const newQuestionName = "New dashboard question";
      const existingQuestionName = "Orders, Count";

      cy.visit("/");
      appBar().findByText("New").click();
      popover().findByText("Dashboard").should("be.visible").click();

      cy.log("Create a new dashboard");
      modal().within(() => {
        // Without waiting for this, the test was constantly flaking locally.
        cy.findByText("Our analytics");

        cy.findByLabelText("Name").type(dashboardName);
        cy.findByLabelText("Description").type(dashboardDescription, {
          delay: 0,
        });
        cy.button("Create").click();
      });

      cy.log("Router should immediately navigate to it");
      cy.wait("@createDashboard").then(({ response: { body } }) => {
        cy.location("pathname").should("contain", `/dashboard/${body.id}`);
      });

      cy.findByTestId("dashboard-empty-state").findByText(
        "This dashboard is looking empty.",
      );

      cy.log("New dashboards are opened in editing mode by default");
      cy.findByTestId("edit-bar").findByText("You're editing this dashboard.");

      cy.log(
        "Should create new question from an empty dashboard (metabase#31848)",
      );
      cy.findByTestId("dashboard-empty-state")
        .findByRole("link", { name: "ask a new one" })
        .click();

      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Products").click();
      });

      queryBuilderHeader().findByText("Save").click();
      modal().within(() => {
        cy.findByLabelText("Name").clear().type(newQuestionName);
        cy.button("Save").click();
      });
      cy.wait("@createQuestion");
      modal().within(() => {
        cy.button("Yes please!").click();
        cy.findByText(dashboardName).click();
      });

      openQuestionsSidebar();
      sidebar().findByText(existingQuestionName).click();

      getDashboardCards().should("have.length", 2);

      saveDashboard();

      cy.log("Breadcrumbs should show a collection dashboard was saved in");
      appBar().findByText("Our analytics").click();

      cy.log("New dashboard should appear in the collection");
      cy.findAllByTestId("collection-entry-name")
        .should("contain", dashboardName)
        .and("contain", newQuestionName);
    });

    it(
      "should create new dashboard inside a collection created on the go",
      // Increased height to avoid scrolling when opening a collection picker
      { viewportHeight: 1000 },
      () => {
        cy.intercept("POST", "api/collection").as("createCollection");
        cy.visit("/");
        closeNavigationSidebar();
        appBar().findByText("New").click();
        popover().findByText("Dashboard").should("be.visible").click();
        const NEW_DASHBOARD = "Foo";
        modal().within(() => {
          cy.findByRole("heading", { name: "New dashboard" });
          cy.findByLabelText("Name").type(NEW_DASHBOARD).blur();
          cy.findByTestId("select-button")
            .should("have.text", "Our analytics")
            .click();
        });
        popover().findByText("New collection").click({ force: true });
        const NEW_COLLECTION = "Bar";
        modal().within(() => {
          cy.findByRole("heading", { name: "New collection" });
          cy.findByLabelText("Name").type(NEW_COLLECTION).blur();
          cy.button("Create").click();
          cy.wait("@createCollection");
          cy.findByText("New dashboard");
          cy.findByTestId("select-button").should("have.text", NEW_COLLECTION);
          cy.button("Create").click();
        });
        saveDashboard();
        cy.findByTestId("app-bar").findByText(NEW_COLLECTION);
      },
    );

    it("adding question to one dashboard shouldn't affect previously visited unrelated dashboards (metabase#26826)", () => {
      cy.intercept("POST", "/api/card").as("saveQuestion");

      visitDashboard(1);

      cy.log("Save new question from an ad-hoc query");
      openProductsTable();
      cy.findByTestId("qb-header").findByText("Save").click();
      modal().button("Save").click();
      cy.wait("@saveQuestion");

      cy.log("Add this new question to a dashboard created on the fly");
      modal().within(() => {
        cy.findByText("Saved! Add this to a dashboard?");
        cy.button("Yes please!").click();
      });

      modal().findByText("Create a new dashboard").click();
      modal().within(() => {
        cy.findByLabelText("Name").type("Foo").blur();
        cy.button("Create").click();
      });

      saveDashboard();

      cy.log(
        "Find the originally visited (unrelated) dashboard in search and go to it",
      );
      appBar()
        .findByPlaceholderText(/^Search/)
        .click();
      cy.findAllByTestId("recently-viewed-item-title")
        .contains("Orders in a dashboard")
        .click();

      cy.log("It should not contain an alien card from the other dashboard");
      getDashboardCards().should("have.length", 1).and("contain", "37.65");
      cy.log("It should not open in editing mode");
      cy.findByTestId("edit-bar").should("not.exist");
    });
  });

  describe("existing dashboard", () => {
    const originalDashboardName = "Amazing Dashboard";

    beforeEach(() => {
      cy.createDashboard({ name: originalDashboardName }).then(
        ({ body: { id } }) => {
          visitDashboard(id);
        },
      );
    });

    context("add a question (dashboard card)", () => {
      it("should be possible via questions sidebar", () => {
        editDashboard();
        openQuestionsSidebar();

        cy.log("The list of saved questions");
        sidebar().findByText("Orders, Count").click();

        cy.log("The search component");
        cy.intercept("GET", "/api/search*").as("search");
        cy.findByPlaceholderText("Search…").type("Orders{enter}");
        cy.wait("@search");
        cy.findByTestId("select-list").findByText("Orders, Count").click();

        cy.log(
          "should show values of added dashboard card via search immediately (metabase#15959)",
        );
        assertBothCardsArePresent();

        cy.log("Remove one card");
        removeDashboardCard(0);
        getDashboardCards().should("have.length", 1);

        cy.log("It should be possible to undo remove that card");
        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Removed card");
          cy.button("Undo").click();
        });

        assertBothCardsArePresent();
        saveDashboard();
        assertBothCardsArePresent();

        function assertBothCardsArePresent() {
          getDashboardCards()
            .should("have.length", 2)
            .and("contain", "Orders, Count")
            .and("contain", "18,760");
        }
      });

      it("should save a dashboard after adding a saved question from an empty state (metabase#29450)", () => {
        cy.findByTestId("dashboard-empty-state").within(() => {
          cy.findByText("This dashboard is looking empty.");
          cy.findByText("Add a saved question").click();
        });

        sidebar().findByText("Orders, Count").click();

        saveDashboard();

        getDashboardCards()
          .should("have.length", 1)
          .and("contain", "Orders, Count")
          .and("contain", "18,760");
      });

      it("should allow navigating to the notebook editor directly from a dashboard card", () => {
        visitDashboard(1);
        showDashboardCardActions();
        getDashboardCardMenu().click();
        popover().findByText("Edit question").should("be.visible").click();
        cy.findByRole("button", { name: "Visualize" }).should("be.visible");
      });
    });

    context("title and description", () => {
      beforeEach(() => {
        cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
        cy.intercept(
          "PUT",
          "/api/dashboard/*",
          cy.spy().as("updateDashboardSpy"),
        ).as("updateDashboard");
      });

      const newTitle = "Renamed";
      const newDescription = "Foo Bar";

      it("should update the name and description without entering the dashboard edit mode", () => {
        cy.findByTestId("dashboard-name-heading").clear().type(newTitle).blur();

        cy.wait("@updateDashboard");
        cy.wait("@getDashboard");

        toggleDashboardInfoSidebar();

        rightSidebar()
          .findByPlaceholderText("Add description")
          .type(newDescription)
          .blur();

        cy.wait("@updateDashboard");
        cy.wait("@getDashboard");

        cy.log(
          "New title and description should be preserved upon page reload",
        );
        cy.reload();
        cy.wait("@getDashboard");

        dashboardHeader().findByDisplayValue(newTitle);
        toggleDashboardInfoSidebar();
        sidebar().findByText(newDescription);

        cy.log("should not call unnecessary API requests (metabase#31721)");
        cy.get("@updateDashboardSpy").should("have.callCount", 2);

        cy.log("Should revert the title change if escaped");
        dashboardHeader().findByDisplayValue(newTitle).type("Whatever{esc}");
        dashboardHeader().findByDisplayValue(newTitle);
        cy.get("@updateDashboardSpy").should("have.callCount", 2);

        cy.log("Should revert the description change if escaped");
        sidebar().findByText(newDescription).type("Baz{esc}");
        sidebar().findByText(newDescription);
        cy.get("@updateDashboardSpy").should("have.callCount", 2);
      });

      it("should update the name and description in the dashboard edit mode", () => {
        editDashboard();

        cy.log("Should revert the title change if editing is cancelled");
        cy.findByTestId("dashboard-name-heading").clear().type(newTitle).blur();
        cy.findByTestId("edit-bar").button("Cancel").click();
        cy.findByTestId("edit-bar").should("not.exist");
        cy.get("@updateDashboardSpy").should("not.have.been.called");
        cy.findByDisplayValue(originalDashboardName);

        editDashboard();

        cy.log("should not take you out of the edit mode when updating title");
        cy.findByTestId("dashboard-name-heading").clear().type(newTitle).blur();
        cy.log(
          "The only way to open a sidebar in edit mode is to click on a revision history",
        );
        dashboardHeader()
          .findByText(/^Edited a few seconds ago/)
          .click();

        rightSidebar()
          .findByPlaceholderText("Add description")
          .type(newDescription)
          .blur();

        // TODO
        // This might be a bug! We're applying the description while still in the edit mode!
        // OTOH, the title is preserved only on save.
        cy.wait("@updateDashboard");

        saveDashboard();
        cy.wait("@updateDashboard");
        cy.get("@updateDashboardSpy").should("have.callCount", 2);
      });

      it("should not have markdown content overflow the description area (metabase#31326)", () => {
        toggleDashboardInfoSidebar();

        const testMarkdownContent =
          "# Heading 1{enter}{enter}**bold** https://www.metabase.com/community_posts/how-to-measure-the-success-of-new-product-features-and-why-it-is-important{enter}{enter}![alt](/app/assets/img/welcome-modal-2.png){enter}{enter}This is my description. ";

        rightSidebar()
          .findByPlaceholderText("Add description")
          .type(testMarkdownContent, { delay: 0 })
          .blur();

        cy.wait("@updateDashboard");

        rightSidebar().within(() => {
          cy.log("Markdown content should not be bigger than its container");
          cy.findByTestId("editable-text").then($markdown => {
            const el = $markdown[0];

            // vertical
            expect(el.clientHeight).to.be.gte(
              el.firstElementChild.clientHeight,
            );

            // horizontal
            $markdown.find("*").each((_index, childEl) => {
              const parentRect = el.getBoundingClientRect();
              const childRect = childEl.getBoundingClientRect();

              expect(parentRect.left).to.be.lte(childRect.left);
              expect(parentRect.right).to.be.gte(childRect.right);
            });
          });

          cy.log(
            "Textarea should have a proper height when we change markdown text",
          );
          cy.findByTestId("editable-text")
            .click()
            .then($el => {
              const lineHeight = parseFloat(
                window.getComputedStyle($el[0]).lineHeight,
              );

              expect($el[0].scrollHeight).to.be.gte(
                testMarkdownContent.split("{enter}").length * lineHeight, // num of lines * lineHeight
              );
            });
        });
      });
    });

    it(
      "should not allow dashboard editing on small screens",
      { viewportWidth: 480, viewportHeight: 800 },
      () => {
        cy.icon("pencil").should("not.be.visible");

        cy.viewport(660, 800);

        cy.icon("pencil").should("be.visible").click();
        cy.findByTestId("edit-bar").findByText(
          "You're editing this dashboard.",
        );
      },
    );

    it(
      "shows sorted cards on mobile screens",
      { viewportWidth: 400, viewportHeight: 800 },
      () => {
        cy.createDashboard().then(({ body: { id: dashboard_id } }) => {
          const cards = [
            createTextCard("bottom", 1), // the bottom card intentionally goes first to have unsorted cards coming from the BE
            createTextCard("top", 0),
          ];

          updateDashboardCards({ dashboard_id, cards });

          visitDashboard(dashboard_id);
        });

        getDashboardCards().eq(0).contains("top");
        getDashboardCards().eq(1).contains("bottom");
      },
    );
  });

  it("should add a filter", () => {
    visitDashboard(1);
    cy.icon("pencil").click();
    cy.icon("filter").click();
    // Adding location/state doesn't make much sense for this case,
    // but we're testing just that the filter is added to the dashboard
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Location").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Is").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Select…").click();

    popover().within(() => {
      cy.findByText("State").click();
    });
    cy.icon("close");
    cy.get(".Button--primary").contains("Done").click();

    saveDashboard();

    cy.log("Assert that the selected filter is present in the dashboard");
    cy.icon("location");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Location");
  });

  it("should link filters to custom question with filtered aggregate data (metabase#11007)", () => {
    // programatically create and save a question as per repro instructions in #11007
    cy.request("POST", "/api/card", {
      name: "11007",
      dataset_query: {
        database: SAMPLE_DB_ID,
        filter: [">", ["field", "sum", { "base-type": "type/Float" }], 100],
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
          filter: ["=", ["field", ORDERS.USER_ID, null], 1],
        },
        type: "query",
      },
      display: "table",
      visualization_settings: {},
    });

    cy.createDashboard({ name: "dash:11007" });

    cy.visit("/collection/root");
    // enter newly created dashboard
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("dash:11007").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is looking empty.");
    // add previously created question to it
    cy.icon("pencil").click();
    openQuestionsSidebar();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("11007").click();

    // add first filter
    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("Time").click();
      cy.findByText("All Options").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Created At");

    // add second filter
    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("ID").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Product ID");

    // add third filter
    cy.icon("filter").click();
    popover().within(() => {
      cy.findByText("Text or Category").click();
      cy.findByText("Starts with").click();
    });
    // and connect it to the card
    selectDashboardFilter(cy.get(".DashCard"), "Category");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You're editing this dashboard.").should("not.exist");
  });

  it("should update a dashboard filter by clicking on a map pin (metabase#13597)", () => {
    cy.createQuestion({
      name: "13597",
      query: {
        "source-table": PEOPLE_ID,
        limit: 2,
      },
      display: "map",
    }).then(({ body: { id: questionId } }) => {
      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        // add filter (ID) to the dashboard
        cy.request("PUT", `/api/dashboard/${dashboardId}`, {
          parameters: [
            {
              id: "92eb69ea",
              name: "ID",
              sectionId: "id",
              slug: "id",
              type: "id",
            },
          ],
        });

        addOrUpdateDashboardCard({
          card_id: questionId,
          dashboard_id: dashboardId,
          card: {
            parameter_mappings: [
              {
                parameter_id: "92eb69ea",
                card_id: questionId,
                target: ["dimension", ["field", PEOPLE.ID, null]],
              },
            ],
            visualization_settings: {
              // set click behavior to update filter (ID)
              click_behavior: {
                type: "crossfilter",
                parameterMapping: {
                  "92eb69ea": {
                    id: "92eb69ea",
                    source: { id: "ID", name: "ID", type: "column" },
                    target: {
                      id: "92eb69ea",
                      type: "parameter",
                    },
                  },
                },
              },
            },
          },
        });

        visitDashboard(dashboardId);
        cy.get(".leaflet-marker-icon") // pin icon
          .eq(0)
          .click({ force: true });
        cy.url().should("include", `/dashboard/${dashboardId}?id=1`);
        cy.contains("Hudson Borer - 1");
      });
    });
  });

  it("should display column options for cross-filter (metabase#14473)", () => {
    const questionDetails = {
      name: "14473",
      native: { query: "SELECT COUNT(*) FROM PRODUCTS", "template-tags": {} },
    };

    cy.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ body: { dashboard_id } }) => {
        cy.log("Add 4 filters to the dashboard");

        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          parameters: [
            { name: "ID", slug: "id", id: "729b6456", type: "id" },
            { name: "ID 1", slug: "id_1", id: "bb20f59e", type: "id" },
            {
              name: "Category",
              slug: "category",
              id: "89873480",
              type: "category",
            },
            {
              name: "Category 1",
              slug: "category_1",
              id: "cbc045f2",
              type: "category",
            },
          ],
        });

        visitDashboard(dashboard_id);
      },
    );

    // Add cross-filter click behavior manually
    cy.icon("pencil").click();
    showDashboardCardActions();
    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("click").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("COUNT(*)").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Update a dashboard filter").click();

    checkOptionsForFilter("ID");
    checkOptionsForFilter("Category");
  });

  it("should not get the parameter values from the field API", () => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "d7988e02";

    cy.log("Add filter to the dashboard");
    cy.request("PUT", "/api/dashboard/1", {
      parameters: [
        {
          id: FILTER_ID,
          name: "Category",
          slug: "category",
          type: "category",
        },
      ],
    });

    cy.log("Connect filter to the existing card");
    cy.request("PUT", "/api/dashboard/1/cards", {
      cards: [
        {
          id: 1,
          card_id: 1,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: 1,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    cy.intercept(
      `/api/dashboard/1/params/${FILTER_ID}/values`,
      cy.spy().as("fetchDashboardParams"),
    );
    cy.intercept(`/api/field/${PRODUCTS.CATEGORY}`, cy.spy().as("fetchField"));
    cy.intercept(
      `/api/field/${PRODUCTS.CATEGORY}/values`,
      cy.spy().as("fetchFieldValues"),
    );

    visitDashboard(1);

    filterWidget().as("filterWidget").click();

    ["Doohickey", "Gadget", "Gizmo", "Widget"].forEach(category => {
      cy.findByText(category);
    });

    cy.get("@fetchDashboardParams").should("have.been.calledOnce");
    cy.get("@fetchField").should("not.have.been.called");
    cy.get("@fetchFieldValues").should("not.have.been.called");
  });

  it("should be possible to visit a dashboard with click-behavior linked to the dashboard without permissions (metabase#15368)", () => {
    cy.request("GET", "/api/user/current").then(
      ({ body: { personal_collection_id } }) => {
        // Save new dashboard in admin's personal collection
        cy.request("POST", "/api/dashboard", {
          name: "15368D",
          collection_id: personal_collection_id,
        }).then(({ body: { id: NEW_DASHBOARD_ID } }) => {
          const COLUMN_REF = `["ref",["field-id",${ORDERS.ID}]]`;
          // Add click behavior to the existing "Orders in a dashboard" dashboard
          cy.request("PUT", "/api/dashboard/1/cards", {
            cards: [
              {
                id: 1,
                card_id: 1,
                row: 0,
                col: 0,
                size_x: 16,
                size_y: 8,
                series: [],
                visualization_settings: {
                  column_settings: {
                    [COLUMN_REF]: {
                      click_behavior: {
                        type: "link",
                        linkType: "dashboard",
                        parameterMapping: {},
                        targetId: NEW_DASHBOARD_ID,
                      },
                    },
                  },
                },
                parameter_mappings: [],
              },
            ],
          });

          cy.intercept("GET", `/api/dashboard/${NEW_DASHBOARD_ID}`).as(
            "loadDashboard",
          );
        });
      },
    );
    cy.signInAsNormalUser();
    visitDashboard(1);

    cy.wait("@loadDashboard");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });

  it("should be possible to scroll vertically after fullscreen layer is closed (metabase#15596)", () => {
    // Make this dashboard card extremely tall so that it spans outside of visible viewport
    cy.request("PUT", "/api/dashboard/1/cards", {
      cards: [
        {
          id: 1,
          card_id: 1,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 20,
          series: [],
          visualization_settings: {},
          parameter_mappings: [],
        },
      ],
    });

    visitDashboard(1);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
    assertScrollBarExists();
    cy.icon("share").click();
    cy.get(".Modal--full").within(() => {
      cy.icon("close").click();
    });
    cy.get(".Modal--full").should("not.exist");
    assertScrollBarExists();
  });

  it("should allow making card hide when it is empty", () => {
    const FILTER_ID = "d7988e02";

    cy.log("Add filter to the dashboard");
    cy.request("PUT", "/api/dashboard/1", {
      parameters: [
        {
          id: FILTER_ID,
          name: "ID",
          slug: "id",
          type: "id",
        },
      ],
    });

    cy.log("Connect filter to the existing card");
    cy.request("PUT", "/api/dashboard/1/cards", {
      cards: [
        {
          id: 1,
          card_id: 1,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: 1,
              target: ["dimension", ["field", ORDERS.ID]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    visitDashboard(1);
    editDashboard();

    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("palette").click({ force: true });
    });

    cy.findByRole("dialog").within(() => {
      cy.findByRole("switch", {
        name: "Hide this card if there are no results",
      }).click();
      cy.button("Done").click();
    });

    saveDashboard();

    // Verify the card is hidden when the value is correct but produces empty results
    filterWidget().click();
    popover().within(() => {
      cy.findByPlaceholderText("Enter an ID").type("-1{enter}");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard").should("not.exist");

    // Verify it becomes visible once the filter is cleared
    filterWidget().within(() => {
      cy.icon("close").click();
    });

    cy.findByTestId("dashcard").findByText("Orders");

    // Verify the card is visible when it returned an error
    filterWidget().click();
    popover().within(() => {
      cy.findByPlaceholderText("Enter an ID").type("text{enter}");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard").within(() => {
      cy.findByText("There was a problem displaying this chart.");
    });
  });
});

describeWithSnowplow("scenarios > dashboard (snowplow)", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/activity/recent_views").as("recentViews");
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should allow users to add link cards to dashboards", () => {
    visitDashboard(1);
    editDashboard();
    cy.findByTestId("dashboard-header").icon("link").click();

    cy.wait("@recentViews");
    cy.findByTestId("custom-edit-text-link").click().type("Orders");

    popover().within(() => {
      cy.findByText(/Loading/i).should("not.exist");
      cy.findByText("Orders in a dashboard").click();
    });

    cy.findByTestId("entity-edit-display-link").findByText(
      /orders in a dashboard/i,
    );

    saveDashboard();

    cy.findByTestId("entity-view-display-link").findByText(
      /orders in a dashboard/i,
    );

    expectGoodSnowplowEvent({
      event: "new_link_card_created",
    });
  });

  it("should track enabling the hide empty cards setting", () => {
    visitDashboard(1);
    editDashboard();

    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("palette").click({ force: true });
    });

    cy.findByRole("dialog").within(() => {
      cy.findByRole("switch", {
        name: "Hide this card if there are no results",
      })
        .click() // enable
        .click() // disable
        .click(); // enable

      expectGoodSnowplowEvent(
        {
          event: "card_set_to_hide_when_no_results",
          dashboard_id: 1,
        },
        2,
      );
    });
  });
});

function checkOptionsForFilter(filter) {
  cy.findByText("Available filters").parent().contains(filter).click();
  popover()
    .should("contain", "Columns")
    .and("contain", "COUNT(*)")
    .and("not.contain", "Dashboard filters");

  // Get rid of the open popover to be able to select another filter
  // Uses force: true because the popover is covering this text. This happens
  // after we introduce the database prompt banner.
  cy.findByText("Pick one or more filters to update").click({ force: true });
}

function assertScrollBarExists() {
  cy.get("body").then($body => {
    const bodyWidth = $body[0].getBoundingClientRect().width;
    cy.window().its("innerWidth").should("be.gte", bodyWidth);
  });
}

function createTextCard(text, row) {
  return {
    row,
    size_x: 24,
    size_y: 1,
    visualization_settings: {
      virtual_card: {
        name: null,
        display: "text",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      text,
    },
  };
}
