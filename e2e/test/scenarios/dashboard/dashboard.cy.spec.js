import { assoc } from "icepick";
import _ from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_DASHBOARD_ENTITY_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { GRID_WIDTH } from "metabase/utils/dashboard_grid";
import {
  createMockDashboardCard,
  createMockParameter,
  createMockVirtualCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";

const { H } = cy;

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("create", () => {
    it("new dashboard UI flow", { tags: "@prerelease" }, () => {
      cy.intercept("POST", "/api/dashboard").as("createDashboard");
      cy.intercept("POST", "/api/card").as("createQuestion");

      const dashboardName = "Dash A";
      const dashboardDescription = "Fresh new dashboard";
      const newQuestionName = "New dashboard question";

      cy.visit("/");
      H.appBar().findByText("New").click();
      H.popover().findByText("Dashboard").should("be.visible").click();

      cy.log(
        "pressing escape should only close the entity picker modal, not the new dashboard modal",
      );
      H.modal().findByTestId("collection-picker-button").click();
      cy.realPress("Escape");
      H.modal().findByText("New dashboard").should("be.visible");

      cy.log("Create a new dashboard");
      H.modal().within(() => {
        // Without waiting for this, the test was constantly flaking locally.
        cy.findByText("Our analytics");

        cy.findByPlaceholderText(/name of your dashboard/i).type(dashboardName);
        cy.findByLabelText("Description").type(dashboardDescription, {
          delay: 0,
        });
        cy.button("Create").click();
      });

      cy.log("Router should immediately navigate to it");
      cy.wait("@createDashboard").then(({ response: { body } }) => {
        cy.location("pathname").should("contain", `/dashboard/${body.id}`);
      });

      cy.log("New dashboards are opened in editing mode by default");
      cy.findByTestId("dashboard-empty-state").should(
        "contain",
        "Create a new question or browse your collections for an existing one.",
      );
      cy.findByTestId("edit-bar").findByText("You're editing this dashboard.");

      cy.log(
        "Should create new question from an empty dashboard (metabase#31848)",
      );
      cy.findByTestId("dashboard-empty-state").button("Add a chart").click();
      cy.findByTestId("new-button-bar").findByText("New Question").click();

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Databases").click();
        cy.findByPlaceholderText("Search…").type("Pro");
        cy.findByText("Products").click();
      });

      H.queryBuilderHeader().findByText("Save").click();
      cy.findByTestId("save-question-modal").within((modal) => {
        cy.findByLabelText("Name").clear().type(newQuestionName);
        cy.findByLabelText("Where do you want to save this?").should(
          "not.exist",
        );
        cy.findByText("Save").click();
      });
      cy.wait("@createQuestion");

      H.openQuestionsSidebar();
      H.sidebar().findByText("Orders, Count").click();

      H.getDashboardCards().should("have.length", 2);

      H.saveDashboard();

      cy.log("Breadcrumbs should show a collection dashboard was saved in");
      H.appBar().findByText("Our analytics").click();

      cy.log("New dashboard question should not appear in the collection");
      cy.findAllByTestId("collection-entry-name")
        .should("contain", dashboardName)
        .and("not.contain", newQuestionName);
    });

    it("should not create a dashboard with a blank name (metabase#63176)", () => {
      cy.visit("/");
      H.newButton().click();
      H.popover().findByText("Dashboard").click();
      H.modal().within(() => {
        cy.findByPlaceholderText(/name of your dashboard/i).type(" ");
        cy.button("Create").click();

        cy.findByText("value must be a non-blank string.").should("be.visible");
        cy.findByPlaceholderText(/name of your dashboard/i).should(
          "have.attr",
          "aria-invalid",
          "true",
        );
        cy.button("Failed").should("be.visible");
      });
    });

    it("adding question to one dashboard shouldn't affect previously visited unrelated dashboards (metabase#26826)", () => {
      cy.intercept("POST", "/api/card").as("saveQuestion");

      H.visitDashboard(ORDERS_DASHBOARD_ID);

      cy.log("Save new question from an ad-hoc query");
      H.openProductsTable();
      cy.findByTestId("qb-header").findByText("Save").click();
      cy.findByTestId("save-question-modal").within(() => {
        cy.findByTestId("dashboard-and-collection-picker-button").click();
      });
      H.pickEntity({
        path: ["Our analytics", "First collection"],
        select: true,
      });
      cy.findByTestId("save-question-modal").within(() => {
        cy.findByText("Save").click();
      });
      cy.wait("@saveQuestion");

      cy.log("Add this new question to a dashboard created on the fly");

      H.checkSavedToCollectionQuestionToast(true);

      // The "New dashboard" button stays disabled until the selected
      // collection's details (incl. can_write) load; clicking too early is a
      // no-op, so wait for it to be enabled before clicking.
      H.entityPickerModal()
        .findByRole("button", { name: "New dashboard" })
        .should("be.enabled")
        .click();
      cy.findByTestId("create-dashboard-on-the-go").within(() => {
        cy.findByPlaceholderText("My new dashboard").type("Foo");
        cy.findByText("Create").click();
      });
      H.entityPickerModal().button("Select").click();

      cy.findByTestId("dashcard").should("be.visible");
      H.saveDashboard();

      cy.log(
        "Find the originally visited (unrelated) dashboard in search and go to it",
      );

      H.commandPaletteButton().click();
      H.commandPalette().within(() => {
        cy.findByText("Recents").should("exist");
        cy.findByRole("option", { name: "Orders in a dashboard" }).click();
      });

      cy.log("It should not contain an alien card from the other dashboard");
      H.getDashboardCards().should("have.length", 1).and("contain", "37.65");
      cy.log("It should not open in editing mode");
      cy.findByTestId("edit-bar").should("not.exist");
    });
  });

  describe("existing dashboard", () => {
    const originalDashboardName = "Amazing Dashboard";

    beforeEach(() => {
      H.createDashboard({ name: originalDashboardName }).then(
        ({ body: { id } }) => {
          H.visitDashboard(id);
        },
      );
    });

    context("add a question (dashboard card)", () => {
      it("should be possible via questions sidebar from an empty state (metabase#29450)", () => {
        cy.findByTestId("dashboard-empty-state").within(() => {
          cy.findByText("This dashboard is empty").should("be.visible");
          cy.findByText("Add a chart").click();
        });

        cy.log("The list of saved questions");
        H.sidebar().findByText("Orders, Count").click();

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
        H.removeDashboardCard(0);
        H.getDashboardCards().should("have.length", 1);

        cy.log("It should be possible to undo remove that card");
        cy.findByTestId("toast-undo").within(() => {
          cy.findByText("Removed card");
          cy.button("Undo").click();
        });

        assertBothCardsArePresent();
        H.saveDashboard();
        assertBothCardsArePresent();

        function assertBothCardsArePresent() {
          H.getDashboardCards()
            .should("have.length", 2)
            .and("contain", "Orders, Count")
            .and("contain", "18,760");
        }
      });

      it("should hide personal collections when adding questions to a dashboard in public collection", () => {
        const collectionInRoot = {
          name: "Collection in root collection",
        };
        H.createCollection(collectionInRoot);
        const myPersonalCollection = "My personal collection";

        cy.log("assert that personal collections are not visible");
        H.editDashboard();
        H.openQuestionsSidebar();
        H.sidebar().within(() => {
          cy.findByText("Our analytics").should("be.visible");
          cy.findByText(collectionInRoot.name).should("be.visible");
          cy.findByText(myPersonalCollection).should("not.exist");
        });

        cy.log("Move dashboard to a personal collection");
        cy.findByTestId("edit-bar").button("Cancel").click();
        H.openDashboardMenu();
        H.popover().findByText("Move").click();
        H.entityPickerModal().within(() => {
          cy.findByText("Bobby Tables's Personal Collection").click();
          cy.button("Move").click();
        });

        H.editDashboard();
        H.openQuestionsSidebar();
        H.sidebar().within(() => {
          cy.log("go to the root collection");
          cy.findByText("Our analytics").click();
          cy.findByText(myPersonalCollection).should("be.visible");
          cy.findByText(collectionInRoot.name).should("be.visible");
        });

        cy.log("Move dashboard back to a root collection");
        cy.findByTestId("edit-bar").button("Cancel").click();
        H.openDashboardMenu();
        H.popover().findByText("Move").click();
        H.entityPickerModal().within(() => {
          cy.findByText("Our analytics").click();
          cy.button("Move").click();
        });

        H.editDashboard();
        H.openQuestionsSidebar();
        H.sidebar().within(() => {
          cy.findByText("Our analytics").should("be.visible");
          cy.findByText(collectionInRoot.name).should("be.visible");
          cy.findByText(myPersonalCollection).should("not.exist");
        });
      });

      it("should save changes to a dashboard after using the 'Add a chart' button from an empty tab (metabase#53132)", () => {
        cy.log("add an existing card");
        H.editDashboard();
        cy.findByTestId("dashboard-header").icon("add").click();
        H.sidebar().findByText("Orders, Count").click();
        cy.findByTestId("dashboard-header").icon("add").click();

        cy.log("create a tab to access emtpy state again");
        H.createNewTab();
        cy.findByTestId("dashboard-empty-state")
          .findByText("Add a chart")
          .click();

        cy.log("save changes before leaving");
        H.sidebar().findByText("New SQL query").click();
        H.modal().findByRole("button", { name: "Save changes" }).click();

        cy.log("create a dashboard question");
        H.NativeEditor.focus().type("SELECT 1");
        H.saveQuestion("Foo question");

        cy.log(
          "should have persisted changes from when dashboard was saved before creating a question",
        );
        cy.findAllByRole("tab", { name: /Tab \d/ }).should("have.length", 2);
        H.getDashboardCards().should("have.length", 2);
      });
    });

    describe("title and description", () => {
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

        H.openDashboardInfoSidebar();

        H.sidesheet()
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

        H.dashboardHeader().findByDisplayValue(newTitle);
        H.openDashboardInfoSidebar();
        H.sidesheet().findByText(newDescription);
        H.closeDashboardInfoSidebar();

        cy.log("should not call unnecessary API requests (metabase#31721)");
        cy.get("@updateDashboardSpy").should("have.callCount", 2);

        cy.log("Should revert the title change if escaped");
        H.dashboardHeader().findByDisplayValue(newTitle).type("Whatever{esc}");
        H.dashboardHeader().findByDisplayValue(newTitle);
        cy.get("@updateDashboardSpy").should("have.callCount", 2);

        cy.log("Should revert the description change if escaped");
        H.openDashboardInfoSidebar();
        H.sidesheet().within(() => {
          cy.findByText(newDescription).type("Baz{esc}");
          cy.findByText(newDescription);
        });
        cy.get("@updateDashboardSpy").should("have.callCount", 2);
      });

      it("should update the name and description in the dashboard edit mode", () => {
        H.editDashboard();

        cy.log("Should revert the title change if editing is cancelled");
        cy.findByTestId("dashboard-name-heading").clear().type(newTitle).blur();
        cy.findByTestId("edit-bar").button("Cancel").click();
        H.modal().button("Discard changes").click();
        cy.findByTestId("edit-bar").should("not.exist");
        cy.get("@updateDashboardSpy").should("not.have.been.called");
        cy.findByDisplayValue(originalDashboardName);

        H.editDashboard();

        cy.log("should not take you out of the edit mode when updating title");
        cy.findByTestId("dashboard-name-heading").clear().type(newTitle).blur();
        cy.log(
          "The only way to open a sidebar in edit mode is to click on a revision history",
        );
        H.dashboardHeader()
          .findByText(/^Edited a few seconds ago/)
          .click();

        H.sidesheet()
          .findByPlaceholderText("Add description")
          .type(newDescription)
          .blur();

        // TODO
        // This might be a bug! We're applying the description while still in the edit mode!
        // OTOH, the title is preserved only on save.
        cy.wait("@updateDashboard");
        H.closeDashboardInfoSidebar();

        H.saveDashboard();
        cy.wait("@updateDashboard");
        cy.get("@updateDashboardSpy").should("have.callCount", 2);
      });

      it("should keep a long title and a markdown description within their areas (metabase#31326, metabase#53370)", () => {
        cy.log("The title is limited to 254 characters");
        const longTitle = "A".repeat(256);
        cy.findByTestId("dashboard-name-heading")
          .as("dashboardInput")
          .clear()
          .type(longTitle, { delay: 0 })
          .blur();
        cy.get("@dashboardInput").invoke("text").should("have.length", 254);
        cy.wait("@updateDashboard");

        cy.log("A long title wraps within the window (metabase#53370)");
        cy.reload();
        cy.findByDisplayValue("A".repeat(254))
          .should("be.visible")
          .then(($el) => {
            cy.window().its("innerWidth").should("be.gt", $el[0].offsetWidth);
          });

        H.openDashboardInfoSidebar();

        const testMarkdownContent =
          "# Heading 1{enter}{enter}**bold** https://www.metabase.com/community_posts/how-to-measure-the-success-of-new-product-features-and-why-it-is-important{enter}{enter}![alt](/app/assets/img/welcome-modal-2.png){enter}{enter}This is my description. ";

        H.sidesheet()
          .findByPlaceholderText("Add description")
          .type(testMarkdownContent, { delay: 0 })
          .blur();

        cy.wait("@updateDashboard");

        H.sidesheet().within(() => {
          cy.log("Markdown content should not be bigger than its container");
          cy.findByTestId("editable-text").then(($markdown) => {
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
            .then(($el) => {
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

    it("should not save the dashboard when the user clicks 'Discard changes'", () => {
      // Navigate to the dashboard via client-side navigation (to trigger the client-side "Discard changes" prompt)
      cy.visit("/");
      cy.findByTestId("main-navbar-root").findByText("Our analytics").click();
      cy.findByTestId("collection-table")
        .findByText(originalDashboardName)
        .click();

      cy.log("Make a change to the dashboard");
      H.editDashboard();
      cy.findByTestId("dashboard-empty-state")
        .findByText("Add a chart")
        .click();
      H.sidebar().findByText("Orders, Count").click();
      H.getDashboardCards().should("have.length", 1);

      cy.log("Navigate back and discard changes");
      cy.go("back");
      H.modal().button("Discard changes").click();
      cy.findByTestId("collection-table")
        .findByText(originalDashboardName)
        .click();

      cy.log("Verify changes were not saved");
      cy.findByTestId("dashboard-empty-state").should("exist");
    });
  });

  it(
    "should sort cards and not allow dashboard editing on small screens",
    { viewportWidth: 400, viewportHeight: 800 },
    () => {
      H.createDashboard().then(({ body: { id: dashboard_id } }) => {
        const cards = [
          // the bottom card intentionally goes first to have unsorted cards coming from the BE
          H.getTextCardDetails({
            row: 1,
            size_x: 24,
            size_y: 1,
            text: "bottom",
          }),
          H.getTextCardDetails({
            row: 0,
            size_x: 24,
            size_y: 1,
            text: "top",
          }),
        ];

        H.updateDashboardCards({ dashboard_id, cards });

        H.visitDashboard(dashboard_id);
      });

      H.getDashboardCard(0).contains("top");
      H.getDashboardCard(1).contains("bottom");

      cy.viewport(480, 800);
      cy.findByLabelText("Edit dashboard").should("not.be.visible");

      cy.viewport(660, 800);

      cy.findByLabelText("Edit dashboard").should("be.visible").click();
      cy.findByTestId("edit-bar").findByText("You're editing this dashboard.");
    },
  );

  it("should allow navigating to the notebook, model and metric editors directly from a dashboard card", () => {
    cy.log("notebook editor");
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.showDashboardCardActions();
    H.getDashboardCardMenu().click();
    H.popover().findByText("Edit question").should("be.visible").click();
    cy.findByRole("button", { name: "Visualize" }).should("be.visible");

    cy.log("model editor");
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "orders",
        type: "model",
        query: {
          "source-table": ORDERS_ID,
        },
      },
      dashboardDetails: {
        name: "Model dashboard",
      },
    }).then(({ body: { dashboard_id, card } }) => {
      cy.wrap(`${card.id}-${card.name}`).as("modelSlug");
      H.visitDashboard(dashboard_id);
    });

    H.showDashboardCardActions();
    H.getDashboardCardMenu().click();
    H.popover().findByText("Edit model").should("be.visible").click();
    H.datasetEditBar().should("be.visible");
    cy.get("@modelSlug").then((slug) => {
      cy.location("pathname").should("eq", `/model/${slug}/query`);
    });

    cy.log("metric editor");
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "orders",
        type: "metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      },
      dashboardDetails: {
        name: "Metric dashboard",
      },
    }).then(({ body: { dashboard_id, card } }) => {
      cy.wrap(`${card.id}-${card.name}`).as("metricSlug");
      H.visitDashboard(dashboard_id);
    });

    H.showDashboardCardActions();
    H.getDashboardCardMenu().click();
    H.popover().findByText("Edit metric").should("be.visible").click();
    H.MetricPage.queryEditor().should("be.visible");
    cy.get("@metricSlug").then((slug) => {
      cy.location("pathname").should("eq", `/metric/${slug}/query`);
    });
  });

  it("should link filters to custom question with filtered aggregate data (metabase#11007)", () => {
    // The filter on the aggregated column puts the aggregation in a nested stage
    H.createQuestion({
      name: "11007",
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          filter: ["=", ["field", ORDERS.USER_ID, null], 1],
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        filter: [">", ["field", "sum", { "base-type": "type/Float" }], 100],
      },
    });

    H.createDashboard({ name: "dash:11007" });

    cy.visit("/collection/root");
    // enter newly created dashboard
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("dash:11007").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is empty");
    // add previously created question to it
    cy.findByLabelText("Edit dashboard").click();
    H.openQuestionsSidebar();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("11007").click();

    H.setFilter("Date picker", "All Options");

    // and connect it to the card
    H.selectDashboardFilter(
      cy.findByTestId("dashcard-container"),
      "Created At",
    );

    // add second filter
    H.setFilter("ID");

    // and connect it to the card
    H.selectDashboardFilter(
      cy.findByTestId("dashcard-container"),
      "Product ID",
    );

    // add third filter
    H.setFilter("Text or Category", "Starts with");
    // and connect it to the card
    H.selectDashboardFilter(cy.findByTestId("dashcard-container"), "Category");

    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
    H.saveDashboard();
    cy.wait("@updateDashboard")
      .its("request.body.dashcards.0.parameter_mappings")
      .should("have.length", 3);
  });

  it("should not get the parameter values from the field API", () => {
    // In this test we're using already present dashboard ("Orders in a dashboard")
    const FILTER_ID = "d7988e02";

    cy.log("Add filter to the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
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
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: ORDERS_QUESTION_ID,
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
      `/api/dashboard/${ORDERS_DASHBOARD_ID}/params/${FILTER_ID}/values`,
      cy.spy().as("fetchDashboardParams"),
    );
    cy.intercept(`/api/field/${PRODUCTS.CATEGORY}`, cy.spy().as("fetchField"));
    cy.intercept(
      `/api/field/${PRODUCTS.CATEGORY}/values`,
      cy.spy().as("fetchFieldValues"),
    );

    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.filterWidget().as("filterWidget").click();

    ["Doohickey", "Gadget", "Gizmo", "Widget"].forEach((category) => {
      cy.findByText(category);
    });

    cy.get("@fetchDashboardParams").should("have.been.calledOnce");
    cy.get("@fetchField").should("not.have.been.called");
    cy.get("@fetchFieldValues").should("not.have.been.called");
  });

  it("should support auto-scrolling to a dashcard via a url hash param and keep the page scrollable after a modal closes (metabase#15596)", () => {
    const questionCard = {
      id: ORDERS_DASHBOARD_DASHCARD_ID,
      card_id: ORDERS_QUESTION_ID,
      row: 0,
      col: 0,
      size_x: 16,
      size_y: 9,
    };
    const paddingCard = H.getTextCardDetails({
      col: 0,
      text: "I'm just padding",
    });
    const TARGET_TEXT = "Scroll to me plz.";
    const targetCard = H.getTextCardDetails({ col: 0, text: TARGET_TEXT });
    const dashcards = [questionCard, paddingCard, targetCard];

    H.createDashboard({ name: "Auto-scroll test", dashcards }).then(
      ({ body: dashboard }) => {
        const targetCard = dashboard.dashcards.find(
          (dc) => dc.visualization_settings?.text === TARGET_TEXT,
        );

        cy.log("should not be visible (below the fold)");
        cy.visit(`/dashboard/${dashboard.id}`);
        cy.findByText(TARGET_TEXT).should("not.be.visible");

        cy.log("closing a modal should unlock scrolling (metabase#15596)");
        H.openLegacyStaticEmbeddingModal({
          resource: "dashboard",
          resourceId: dashboard.id,
        });
        cy.get("body").should("have.attr", "data-scroll-locked");

        H.modal().within(() => {
          cy.icon("close").click();
        });
        H.modal().should("not.exist");
        cy.get("body").should("not.have.attr", "data-scroll-locked");
        cy.get("body").should("not.have.css", "overflow", "hidden");

        cy.log("should scroll into view w/ scrollTo hash param");
        cy.visit(`/dashboard/${dashboard.id}#scrollTo=${targetCard.id}`);
        // wait for scroll to complete (hash cleared) then verify visibility
        cy.location("hash").should("not.include", "scrollTo");
        cy.findByText(TARGET_TEXT).should("be.visible");
      },
    );
  });

  describe("warn before leave", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/card/*/query_metadata").as("queryMetadata");
    });

    it("should warn a user before leaving after changing cards or tabs on a dashboard", () => {
      cy.visit("/");
      // add
      createNewDashboard();
      cy.findByTestId("dashboard-header").icon("add").click();
      cy.findByTestId("add-card-sidebar").findByText("Orders").click();
      cy.wait("@queryMetadata");
      assertPreventLeave({ openSidebar: false });
      H.saveDashboard();

      // edit
      H.editDashboard();
      const card = () =>
        cy
          .findAllByTestId("dashcard-container", { scrollBehavior: false })
          .eq(0);
      dragOnXAxis(card(), 100);
      assertPreventLeave();
      H.saveDashboard();

      // remove
      H.editDashboard();
      H.removeDashboardCard();
      assertPreventLeave();
      H.saveDashboard();

      // add tab
      H.editDashboard();
      H.createNewTab();
      assertPreventLeave();
      H.saveDashboard();

      // move tab
      H.editDashboard();
      dragOnXAxis(cy.findByRole("tab", { name: "Tab 2" }), -200);
      // assert tab order is now correct and ui has caught up to result of dragging the tab
      cy.findAllByRole("tab").eq(0).should("have.text", "Tab 2");
      cy.findAllByRole("tab").eq(1).should("have.text", "Tab 1");

      cy.wait(1000);
      assertPreventLeave();
      H.saveDashboard();

      // duplicate tab
      H.editDashboard();
      H.duplicateTab("Tab 1");
      assertPreventLeave();
      H.saveDashboard();

      cy.findByRole("tab", { name: "Copy of Tab 1" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );

      // remove tab
      H.editDashboard();
      H.deleteTab("Copy of Tab 1");
      // url is changed after removing the tab
      // can be a side effect
      cy.url().should("include", "tab-1");
      assertPreventLeave();
      H.saveDashboard();

      // rename tab
      H.editDashboard();
      H.renameTab("Tab 2", "Foo tab");
      assertPreventLeave();
      H.saveDashboard();

      cy.log("No warning without changes");
      H.editDashboard();
      H.openQuestionsSidebar();
      cy.findByTestId("new-button-bar").findByText("New Question").click();
      cy.location("pathname").should("not.match", /^\/dashboard\//);
      cy.get("body").should("not.contain", "Save your changes?");
    });

    function createNewDashboard() {
      H.newButton("Dashboard").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("Test");
        cy.findByRole("button", { name: "Create" }).click();
      });
    }

    function dragOnXAxis(el, distance) {
      el.trigger("mousedown", { clientX: 0 })
        .trigger("mousemove", { clientX: distance })
        // to avoid flakiness
        .wait(100)
        .trigger("mouseup");
    }

    function assertPreventLeave(options = { openSidebar: true }) {
      if (options.openSidebar) {
        H.openQuestionsSidebar();
      }
      cy.findByText("New Question").click();
      H.modal()
        .should("exist")
        .within(() => {
          cy.findByText("Save your changes?").should("exist");
          cy.findByRole("button", { name: "Cancel" }).click();
        });
    }
  });
});

describe("scenarios > dashboard > tracking", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should be possible to add iframe cards from various iframe and URL inputs and allowed hosts", () => {
    const testCases = [
      {
        input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      },
      {
        input: "https://youtu.be/dQw4w9WgXcQ",
        expected: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      },
      {
        input: "https://www.loom.com/share/1234567890abcdef",
        expected: "https://www.loom.com/embed/1234567890abcdef",
      },
      {
        input: "https://vimeo.com/123456789",
        expected: "https://player.vimeo.com/video/123456789",
      },
      {
        input: "example.com",
        expected: "https://example.com",
      },
      {
        input: "https://example.com",
        expected: "https://example.com",
      },
      {
        input:
          '<iframe src="https://example.com" onload="alert(\'XSS\')"></iframe>',
        expected: "https://example.com",
      },
    ];

    H.updateSetting("allowed-iframe-hosts", "*");
    H.createDashboard({ name: "iframe card" }).then(({ body: { id } }) => {
      H.visitDashboard(id);

      H.editDashboard();
      testCases.forEach(({ input, expected }, index) => {
        H.addIFrameWhileEditing(input);
        H.getDashboardCard(index)
          .findByTestId("dashboardcard-actions-panel")
          .should("not.exist");
        cy.button("Done").click();
        H.getDashboardCard(index).realHover();
        H.getDashboardCard(index)
          .findByTestId("dashboardcard-actions-panel")
          .should("be.visible");
        validateIFrame(expected, index);
      });

      H.saveDashboard();
      H.expectUnstructuredSnowplowEvent({ event: "dashboard_saved" });

      // The saved dashcard order is not guaranteed, so compare sorted sources
      H.getDashboardCards()
        .find("iframe")
        .should(($iframes) => {
          const iframes = $iframes.toArray();
          expect(
            iframes.map((el) => el.getAttribute("src")).sort(),
          ).to.deep.equal(testCases.map(({ expected }) => expected).sort());
          iframes.forEach((el) => {
            expect(el.getAttribute("sandbox")).to.equal(IFRAME_SANDBOX);
            expect(el.hasAttribute("onload")).to.equal(false);
          });
        });

      H.expectUnstructuredSnowplowEvent(
        {
          event: "new_iframe_card_created",
          target_id: id,
          event_detail: "example.com",
        },
        3,
      );
      ["www.youtube.com", "youtu.be", "www.loom.com", "vimeo.com"].forEach(
        (domain) =>
          H.expectUnstructuredSnowplowEvent({
            event: "new_iframe_card_created",
            target_id: id,
            event_detail: domain,
          }),
      );
    });

    cy.log("allowed-iframe-hosts setting");
    const errorMessage = /can not be embedded in iframe cards/;

    H.updateSetting(
      "allowed-iframe-hosts",
      ["youtube.com", "player.videos.com"].join("\n"),
    );

    H.createDashboard().then(({ body: { id } }) => H.visitDashboard(id));
    H.editDashboard();

    // Test allowed domain with subdomains
    H.addIFrameWhileEditing("https://youtube.com/watch?v=dQw4w9WgXcQ");
    cy.button("Done").click();
    validateIFrame("https://www.youtube.com/embed/dQw4w9WgXcQ");

    // Test allowed subdomain, but no other domains
    H.editIFrameWhileEditing(0, "player.videos.com/video/123456789");
    cy.button("Done").click();
    validateIFrame("https://player.videos.com/video/123456789");

    H.editIFrameWhileEditing(0, "videos.com/video/123456789");
    cy.button("Done").click();
    H.getDashboardCard().within(() => {
      cy.findByText(errorMessage).should("be.visible");
      cy.get("iframe").should("not.exist");
    });

    H.editIFrameWhileEditing(0, "www.videos.com/video");
    cy.button("Done").click();
    H.getDashboardCard().within(() => {
      cy.findByText(errorMessage).should("be.visible");
      cy.get("iframe").should("not.exist");
    });

    // Test forbidden domain and subdomains
    H.editIFrameWhileEditing(0, "https://example.com");
    cy.button("Done").click();
    H.getDashboardCard().within(() => {
      cy.findByText(errorMessage).should("be.visible");
      cy.get("iframe").should("not.exist");
    });

    H.editIFrameWhileEditing(0, "www.example.com");
    cy.button("Done").click();
    H.getDashboardCard().within(() => {
      cy.findByText(errorMessage).should("be.visible");
      cy.get("iframe").should("not.exist");
    });
  });

  it("should allow making card hide when it is empty and track enabling it", () => {
    const FILTER_ID = "d7988e02";

    cy.log("Add filter to the dashboard");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
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
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: FILTER_ID,
              card_id: ORDERS_QUESTION_ID,
              target: ["dimension", ["field", ORDERS.ID]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("palette").click({ force: true });
    });

    cy.findByRole("dialog").within(() => {
      cy.findByRole("switch", {
        name: "Hide this card if there are no results",
      })
        .click({ force: true }) // enable
        .click({ force: true }) // disable
        .click({ force: true }); // enable

      H.expectUnstructuredSnowplowEvent(
        {
          event: "card_set_to_hide_when_no_results",
          dashboard_id: ORDERS_DASHBOARD_ID,
        },
        2,
      );
      cy.button("Done").click();
    });

    H.saveDashboard();

    // Verify the card is hidden when the value is correct but produces empty results
    H.filterWidget().click();
    H.dashboardParametersPopover().within(() => {
      cy.findByPlaceholderText("Enter an ID").type("-1{enter}");
      cy.button("Add filter").click();
    });

    cy.findByTestId("dashcard").should("not.exist");

    // Verify it becomes visible once the filter is cleared
    H.filterWidget().within(() => {
      cy.icon("close").click();
    });

    cy.findByTestId("dashcard").findByText("Orders");
  });

  it("should allow the creator to change the dashboard width to 'fixed' or 'full'", () => {
    const TAB_1 = {
      id: 1,
      name: "Tab 1",
    };
    const TAB_2 = {
      id: 2,
      name: "Tab 2",
    };
    const DASHBOARD_TEXT_FILTER = {
      id: "94f9e513",
      name: "Text filter",
      slug: "filter-text",
      type: "string/contains",
    };

    H.createDashboardWithTabs({
      tabs: [TAB_1, TAB_2],
      parameters: [{ ...DASHBOARD_TEXT_FILTER, default: "Example Input" }],
      dashcards: [
        createMockVirtualDashCard({
          id: -1,
          dashboard_tab_id: TAB_1.id,
          size_x: GRID_WIDTH,
          parameter_mappings: [
            { parameter_id: "94f9e513", target: ["text-tag", "Name"] },
          ],
          card: createMockVirtualCard({ display: "text" }),
          visualization_settings: {
            text: "Top: {{Name}}",
          },
        }),
        createMockVirtualDashCard({
          id: -2,
          size_x: GRID_WIDTH,
          dashboard_tab_id: TAB_1.id,
          card: createMockVirtualCard({ display: "text" }),
          visualization_settings: {
            text: "Bottom",
          },
        }),
      ],
    }).then((dashboard) => H.visitDashboard(dashboard.id));

    // new dashboards should default to 'fixed' width
    H.assertDashboardFixedWidth();

    // toggle full-width
    H.editDashboard();
    cy.findByLabelText("Toggle width").click();
    H.popover().findByLabelText("Full width").click();
    H.assertDashboardFullWidth();
    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_width_toggled",
      full_width: true,
    });

    // confirm it saves the state after saving and refreshing
    H.saveDashboard();
    cy.reload();
    H.getDashboardCard(0)
      .findByText("Top: contains Example Input")
      .should("be.visible");
    H.getDashboardCard(1).findByText("Bottom").should("be.visible");
    H.assertDashboardFullWidth();

    // toggle back to fixed
    H.editDashboard();
    cy.findByLabelText("Toggle width").click();
    H.popover().findByLabelText("Full width").click();
    H.assertDashboardFixedWidth();
    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_width_toggled",
      full_width: false,
    });
  });

  it("should track reverting to an old version", () => {
    H.createDashboard({ name: "Foo" }).then(({ body: { id } }) => {
      cy.request("PUT", `/api/dashboard/${id}`, { name: "Bar" });
      H.visitDashboard(id);

      cy.intercept("GET", "/api/revision*").as("revisionHistory");

      cy.findByTestId("dashboard-header")
        .findByLabelText("More info")
        .should("be.visible")
        .click();

      H.sidesheet().within(() => {
        cy.findByRole("tab", { name: "History" }).click();
        cy.wait("@revisionHistory");
        cy.findByTestId("dashboard-history-list").should("be.visible");
        cy.findByTestId("question-revert-button").click();
      });

      H.expectUnstructuredSnowplowEvent({
        event: "revert_version_clicked",
        event_detail: "dashboard",
      });

      // Simulate a backend failure on revert and confirm we surface
      // the error message as a toast (UXW-310).
      cy.intercept("POST", "/api/revision/revert", {
        statusCode: 500,
        body: { message: "Cannot revert: missing dashboard" },
      }).as("failedRevert");

      H.sidesheet().within(() => {
        cy.findAllByTestId("question-revert-button").first().click();
      });
      cy.wait("@failedRevert");

      H.undoToast().should("contain.text", "Cannot revert: missing dashboard");
    });
  });
});

describe("scenarios > dashboard > permissions", () => {
  let dashboardId;

  beforeEach(() => {
    H.restore();
    // This first test creates a dashboard with two questions.
    // One is in Our Analytics the other is in a more locked down collection.
    cy.signInAsAdmin();

    // The setup is a bunch of nested API calls to create the questions, dashboard, dashcards, collections and link them all up together.
    let firstQuestionId, secondQuestionId;

    cy.request("POST", "/api/collection", {
      name: "locked down collection",
      parent_id: null,
    }).then(({ body: { id: collection_id } }) => {
      cy.request("GET", "/api/collection/graph").then(
        ({ body: { revision, groups } }) => {
          // update the perms for the just-created collection
          cy.request("PUT", "/api/collection/graph", {
            revision,
            groups: _.mapObject(groups, (groupPerms, groupId) =>
              assoc(
                groupPerms,
                collection_id,
                // 2 is admins, so leave that as "write"
                groupId === "2" ? "write" : "none",
              ),
            ),
          });
        },
      );

      cy.request("POST", "/api/card", {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "native",
          native: { query: "select 'foo'" },
        },
        display: "table",
        visualization_settings: {},
        name: "First Question",
        collection_id,
      }).then(({ body: { id } }) => (firstQuestionId = id));

      cy.request("POST", "/api/card", {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "native",
          native: { query: "select 'bar'" },
        },
        display: "table",
        visualization_settings: {},
        name: "Second Question",
        collection_id: null,
      }).then(({ body: { id } }) => (secondQuestionId = id));
    });

    H.createDashboard().then(({ body: { id: dashId } }) => {
      dashboardId = dashId;

      H.updateDashboardCards({
        dashboard_id: dashId,
        cards: [
          { card_id: firstQuestionId, row: 0, col: 0, size_x: 8, size_y: 6 },
          { card_id: secondQuestionId, row: 0, col: 6, size_x: 8, size_y: 6 },
        ],
      });
    });
  });

  it("should show each user the cards and dashboards they have permission to see", () => {
    cy.log("Admins can see all cards");
    H.visitDashboard(dashboardId);
    H.getDashboardCards()
      .should("have.length", 2)
      .and("contain", "First Question")
      .and("contain", "foo")
      .and("contain", "Second Question")
      .and("contain", "bar");

    cy.log("Users without collection access see the other cards");
    cy.signIn("nodata");
    H.visitDashboard(dashboardId);
    H.getDashboardCards()
      .should("have.length", 2)
      .and("contain", "Sorry, you don't have permission to see this card.")
      .and("contain", "Second Question")
      .and("contain", "bar");

    cy.log("Users without dashboard access see an error");
    cy.signIn("nocollection");
    cy.visit(`/dashboard/${dashboardId}`);
    H.main()
      .findByText("Sorry, you don’t have permission to see that.")
      .should("be.visible");
  });

  it("should not count cards the user cannot see as loading (metabase#28756)", () => {
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", (req) => {
      req.on("response", (res) => {
        res.setDelay(60_000);
      });
    });

    cy.log("The tab title shows the loading progress");
    cy.visit(`/dashboard/${dashboardId}`);
    cy.title().should("contain", "0/2 loaded");

    cy.log(
      "A card the user has no permission to see does not count as loading",
    );
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", (req) => {
      // req.continue() skips the intercepts that were added before this one
      req.continue();
    });
    cy.signInAsNormalUser();
    cy.visit(`/dashboard/${dashboardId}`);
    H.getDashboardCards()
      .should("contain", "Sorry, you don't have permission to see this card.")
      .and("contain", "bar");
    cy.title().should("match", /^Test Dashboard · /);
  });
});

describe("scenarios > dashboard > entity id support", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should redirect entity id paths to the dashboard, its tabs and its modals, and keep the search params", () => {
    cy.log("Dashboard entity id");
    cy.visit(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}`);
    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}`);
    H.main().findByText("Orders in a dashboard").should("be.visible");

    cy.log("Dashboard entity id with the move modal path");
    cy.visit(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}/move`);
    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}/move`);
    H.main().findByText("Orders in a dashboard").should("be.visible");
    H.modal().findByText("Move dashboard to…").should("be.visible");

    cy.log("Dashboard and tab entity ids");
    H.createDashboardWithTabs({
      tabs: [
        { name: "Tab 1", id: -1 },
        { name: "Tab 2", id: -2 },
      ],
      dashcards: [],
    }).then((dashboard) => {
      cy.visit(
        `/dashboard/entity/${dashboard.entity_id}?tab=${dashboard.tabs[1].entity_id}`,
      );

      cy.url().should(
        "contain",
        `/dashboard/${dashboard.id}?tab=${dashboard.tabs[1].id}`,
      );

      H.main()
        .findByRole("tab", { name: "Tab 2" })
        .should("have.attr", "aria-selected", "true");
    });

    cy.log("Search params such as filters are kept");
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        {
          id: "abc123",
          name: "Text",
          slug: "text",
          type: "string/=",
        },
      ],
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: "abc123",
              card_id: ORDERS_QUESTION_ID,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });
    cy.visit(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}?text=123`);
    cy.url()
      .should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}`)
      .and("contain", "text=123");
    H.filterWidget().should("contain", "Text").and("contain", "123");
  });

  it("should show a 404 page for entity ids that do not exist", () => {
    const assertNotFound = () =>
      H.main().findByText("We're a little lost...").should("be.visible");

    cy.log("non existing dashboard entity id");
    cy.visit(`/dashboard/entity/${"x".repeat(21)}`);
    assertNotFound();

    cy.log("non existing dashboard entity id that starts with a number");
    cy.visit(`/dashboard/entity/${"12".padEnd(21, "x")}`);
    assertNotFound();

    cy.log("non existing tab entity id that starts with a number");
    cy.visit(
      `/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}?tab=${"12".padEnd(21, "x")}`,
    );
    assertNotFound();
  });
});

const IFRAME_SANDBOX =
  "allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts";

function validateIFrame(src, index = 0) {
  H.getDashboardCard(index)
    .find("iframe")
    .should("have.attr", "src", src)
    .and("have.attr", "sandbox", IFRAME_SANDBOX)
    .and("not.have.attr", "onload");
}

describe("issue 43219", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
    },
  };

  const textFilter = createMockParameter({
    name: "Text",
    slug: "string",
    id: "5aefc726",
    type: "string/=",
    sectionId: "string",
  });

  const cardsCount = 10;

  const getQuestionAlias = (index) => `question-${index}`;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.cypressWaitAll(
      Array.from({ length: cardsCount }, (_value, index) => {
        const name = `Series ${index + 1}`;
        return H.createQuestion({ ...questionDetails, name }).then(
          ({ body: question }) => {
            cy.wrap(question).as(getQuestionAlias(index));
          },
        );
      }),
    );

    cy.then(function () {
      H.createDashboardWithQuestions({
        dashboardDetails: {
          parameters: [textFilter],
        },
        questions: [
          {
            ...questionDetails,
            name: "Base series",
          },
        ],
        cards: [
          {
            size_x: 4,
            size_y: 3,
            series: Array.from(
              { length: cardsCount },
              (_value, index) => this[getQuestionAlias(index)],
            ),
          },
        ],
      }).then(({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      });
    });
  });

  it("is possible to map parameters to dashcards with lots of series (metabase#43219)", () => {
    H.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText("Text")
      .click();

    H.getDashboardCard(0).within(() => {
      cy.findByText("Series 10").should("exist").and("not.be.visible");

      cy.findByTestId("visualization-root").scrollTo("bottom");
      cy.findByTestId("parameter-mapper-container").scrollTo("right");

      cy.findByText("Series 10").should("be.visible");
    });
  });
});

describe("issue 16559", () => {
  const dashboardDetails = {
    name: "16559 Dashboard",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createDashboard(dashboardDetails).then((response) => {
      H.visitDashboard(response.body.id);
    });

    cy.intercept("PUT", "/api/dashboard/*").as("saveDashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should always show the most recent revision (metabase#16559)", () => {
    H.openDashboardInfoSidebar().within(() => {
      cy.contains("button", "History").click();
      cy.findByRole("tab", { name: "History" }).click();
      cy.log("Dashboard creation");
      cy.findByTestId("dashboard-history-list")
        .findAllByTestId("revision-history-event")
        .eq(0)
        .findByText("You created this.")
        .should("be.visible");
    });
    H.closeDashboardInfoSidebar();

    cy.log("Edit dashboard");
    H.editDashboard();
    H.openQuestionsSidebar();
    H.sidebar().findByText("Orders, Count").click();
    cy.wait("@cardQuery");
    // Use the canonical save helper so we deterministically wait for the whole
    // save-and-settle sequence (PUT + query_metadata reload, edit-bar gone, all
    // dashcards loaded). The previous ad-hoc `Save` click only awaited the PUT,
    // so the "More info" click below raced the trailing re-render and was
    // dropped, leaving the sidesheet closed.
    H.saveDashboard();

    H.openDashboardInfoSidebar().within(() => {
      cy.contains("button", "History").click();
      cy.findByTestId("dashboard-history-list")
        .findAllByTestId("revision-history-event")
        .eq(0)
        .findByText("You added a card.")
        .should("be.visible");
    });
    H.closeDashboardInfoSidebar();

    cy.log("Change dashboard name");
    cy.findByTestId("dashboard-name-heading").click().type(" modified").blur();
    cy.wait("@saveDashboard");

    H.openDashboardInfoSidebar().within(() => {
      cy.contains("button", "History").click();

      cy.findByTestId("dashboard-history-list")
        .findAllByTestId("revision-history-event")
        .eq(0)
        .findByText(
          'You renamed this Dashboard from "16559 Dashboard" to "16559 Dashboard modified".',
        )
        .should("be.visible");

      cy.log("Add description");
      cy.findByRole("tab", { name: "Overview" }).click();

      cy.findByPlaceholderText("Add description")
        .click()
        .type("16559 description")
        .blur();
      cy.wait("@saveDashboard");

      cy.contains("button", "History").click();

      cy.findByTestId("dashboard-history-list")
        .findAllByTestId("revision-history-event")
        .eq(0)
        .findByText("You added a description.")
        .should("be.visible");

      cy.log("Toggle auto-apply filters");
    });
    H.closeDashboardInfoSidebar();

    H.openDashboardSettingsSidebar();
    H.sidesheet().findByLabelText("Auto-apply filters").click();
    cy.wait("@saveDashboard");
    H.closeDashboardSettingsSidebar();

    H.openDashboardInfoSidebar().within(() => {
      cy.contains("button", "History").click();

      cy.findByTestId("dashboard-history-list")
        .findAllByTestId("revision-history-event")
        .eq(0)
        .findByText("You set auto apply filters to false.")
        .should("be.visible");
    });
    H.closeDashboardInfoSidebar();

    cy.log("Move dashboard to another collection");
    H.dashboardHeader().icon("ellipsis").click();
    H.popover().findByText("Move").click();
    H.entityPickerModal().within(() => {
      cy.findByText("First collection").click();
      cy.button("Move").click();
      cy.wait(["@saveDashboard"]);
    });

    H.openDashboardInfoSidebar().within(() => {
      cy.contains("button", "History").click();
      cy.findByTestId("dashboard-history-list")
        .findAllByTestId("revision-history-event")
        .eq(0)
        .findByText("You moved this Dashboard to First collection.")
        .should("be.visible");
    });
  });
});

describe("should not redirect users to other pages when linking an entity (metabase#35037)", () => {
  const TEST_DASHBOARD_NAME = "Orders in a dashboard";
  const TEST_QUESTION_NAME = "Question#35037";

  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    cy.intercept("GET", "/api/activity/recents?*").as("recentViews");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should add link cards without redirecting users to recent or search items", () => {
    H.createNativeQuestion({
      name: TEST_QUESTION_NAME,
      native: { query: "SELECT 1" },
    });
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    cy.location("pathname").then((originPath) => {
      cy.wrap(originPath).as("originPath");
    });

    cy.log("link a recent item");
    cy.findByLabelText("Add a link or iframe").click();
    H.popover().findByText("Link").click();
    cy.wait("@recentViews");

    cy.findByTestId("recents-list-container").within(() => {
      cy.findByText(TEST_DASHBOARD_NAME).click();
    });

    cy.findAllByTestId("entity-edit-display-link")
      .should("have.length", 1)
      .and("contain", TEST_DASHBOARD_NAME);
    cy.findByTestId("recents-list-container").should("not.exist");
    assertOriginPath();

    cy.log("link a search item");
    cy.icon("link").click();
    H.popover().findByText("Link").click();
    cy.findByTestId("custom-edit-text-link")
      .findByPlaceholderText("https://example.com")
      .type(TEST_QUESTION_NAME);
    cy.findByTestId("search-results-list").within(() => {
      cy.findByText(TEST_QUESTION_NAME).click();
    });

    cy.findAllByTestId("entity-edit-display-link")
      .should("have.length", 2)
      .and("contain", TEST_QUESTION_NAME);
    cy.findByTestId("search-results-list").should("not.exist");
    assertOriginPath();

    // A blocked in-app navigation opens a leave confirmation modal, which
    // prevents the save
    H.saveDashboard();
    cy.findAllByTestId("entity-view-display-link")
      .should("have.length", 2)
      .and("contain", TEST_DASHBOARD_NAME)
      .and("contain", TEST_QUESTION_NAME);
    assertOriginPath();

    H.expectUnstructuredSnowplowEvent({ event: "new_link_card_created" }, 2);
  });

  function assertOriginPath() {
    cy.get("@originPath").then((originPath) => {
      cy.location("pathname").should("eq", originPath);
    });
  }
});

describe("issue 47170", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.request("POST", `/api/bookmark/dashboard/${ORDERS_DASHBOARD_ID}`);

    H.createDashboard({ name: "Dashboard A" }, { wrapId: true }).then(
      (dashboardId) => {
        cy.request("POST", `/api/bookmark/dashboard/${dashboardId}`);
      },
    );

    // Keep the first dashboard loading so that navigating away cancels its fetch
    cy.intercept(
      { method: "GET", pathname: `/api/dashboard/${ORDERS_DASHBOARD_ID}` },
      (req) => {
        req.on("response", (res) => {
          res.setDelay(10_000);
        });
      },
    );
  });

  it("should not show error when dashboard fetch request is cancelled (metabase#47170)", () => {
    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);

    H.navigationSidebar().findByText("Dashboard A").should("be.visible");
    H.main().findByTestId("dashboard-header-skeleton").should("be.visible");
    H.navigationSidebar().findByText("Dashboard A").click();

    H.main().within(() => {
      cy.findByText("Dashboard A").should("be.visible");
      cy.findByText("Something’s gone wrong").should("not.exist");
    });
  });
});

describe("issue 51524", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should show legible dark mode colors in fullscreen mode (metabase#51524)", () => {
    cy.intercept("PUT", "/api/setting/color-scheme").as("saveColorScheme");
    cy.visit("/account/profile");
    cy.findByDisplayValue("Use system default").click();
    H.popover().findByText("Dark").click();
    cy.wait("@saveColorScheme");
    cy.visit(`/dashboard/${ORDERS_DASHBOARD_ID}`);

    H.dashboardHeader().findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Enter fullscreen").click();

    const primaryTextColor = "rgba(255, 255, 255, 0.95)";

    cy.findByTestId("dashboard-name-heading").should(
      "have.css",
      "color",
      primaryTextColor,
    );

    H.getDashboardCard(0)
      .findByText("37.65")
      .should("have.css", "color", primaryTextColor);

    cy.findByTestId("sharing-menu-button").should(
      "have.css",
      "color",
      primaryTextColor,
    );
  });
});

describe("issue 49556", () => {
  const TAB = { id: 1, name: "Tab" };

  const PEOPLE_NAME_FIELD_REF = [
    "field",
    PEOPLE.NAME,
    { "base-type": "type/Text" },
  ];

  const TARGET_PARAMETER = {
    id: "d7988e02",
    name: "Target",
    slug: "target",
    type: "category",
    filteringParameters: ["d7988e03"],
  };

  const SOURCE_PARAMETER = {
    id: "d7988e03",
    name: "Source",
    slug: "source",
    type: "category",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createDashboardWithTabs({
      tabs: [TAB],
      parameters: [TARGET_PARAMETER, SOURCE_PARAMETER],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          dashboard_tab_id: TAB.id,
          size_x: 10,
          size_y: 4,
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              parameter_id: TARGET_PARAMETER.id,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                PEOPLE_NAME_FIELD_REF,
                { "stage-number": 0 },
              ],
            },
            {
              parameter_id: SOURCE_PARAMETER.id,
              card_id: ORDERS_QUESTION_ID,
              target: [
                "dimension",
                PEOPLE_NAME_FIELD_REF,
                { "stage-number": 0 },
              ],
            },
          ],
        }),
      ],
    }).then((dashboard) => H.visitDashboard(dashboard.id));
  });

  it("unlinks the filter when it is removed (metabase#49556)", () => {
    H.editDashboard();

    cy.log("Values of a linked filter cannot be edited");
    cy.findByTestId("fixed-width-filters").findByText("Target").click();
    H.dashboardParameterSidebar().button("Edit").should("be.disabled");

    cy.findByTestId("fixed-width-filters").findByText("Source").click();
    H.dashboardParameterSidebar().findByText("Remove").click();
    cy.findByTestId("fixed-width-filters")
      .findByText("Source")
      .should("not.exist");

    cy.findByTestId("fixed-width-filters").findByText("Target").click();
    H.dashboardParameterSidebar().button("Edit").should("be.enabled");
  });
});

describe("issues 54353 and 52674", () => {
  const peopleSourceFieldRef = [
    "field",
    PEOPLE.SOURCE,
    { "base-type": "type/Text", "source-field": ORDERS.USER_ID },
  ];
  const ordersCreatedAtFieldRef = [
    "field",
    ORDERS.CREATED_AT,
    { "base-type": "type/DateTime", "temporal-unit": "month" },
  ];
  const ordersTotalFieldRef = [
    "field",
    ORDERS.TOTAL,
    { "base-type": "type/Number" },
  ];

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should open and close filter widgets with the keyboard (metabase#54353, metabase#52674)", () => {
    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [
          createMockParameter({
            id: "param-1",
            name: "Date",
            slug: "date",
            type: "date/all-options",
          }),
          createMockParameter({
            id: "param-2",
            name: "Number",
            slug: "number",
            type: "number/between",
          }),
        ],
      },
      questions: [
        {
          name: "fooBarQuestion",
          display: "bar",
          query: {
            aggregation: [["count"]],
            breakout: [peopleSourceFieldRef, ordersCreatedAtFieldRef],
            "source-table": ORDERS_ID,
          },
        },
        {
          query: {
            "source-table": ORDERS_ID,
          },
        },
      ],
    }).then(({ dashboard, questions: [barQuestion, tableQuestion] }) => {
      cy.request("GET", `/api/dashboard/${dashboard.id}`).then(
        ({ body: dashboard }) => {
          const findDashcard = (question) =>
            dashboard.dashcards.find(
              (dashcard) => dashcard.card_id === question.id,
            );
          const barDashcard = findDashcard(barQuestion);
          const tableDashcard = findDashcard(tableQuestion);
          cy.request("PUT", `/api/dashboard/${dashboard.id}`, {
            dashcards: [
              {
                ...barDashcard,
                parameter_mappings: [
                  {
                    card_id: barDashcard.card_id,
                    parameter_id: "param-1",
                    target: ["dimension", ordersCreatedAtFieldRef],
                  },
                ],
              },
              {
                ...tableDashcard,
                parameter_mappings: [
                  {
                    card_id: tableDashcard.card_id,
                    parameter_id: "param-2",
                    target: ["dimension", ordersTotalFieldRef],
                  },
                ],
              },
            ],
          }).then(() => {
            cy.wrap(dashboard.id).as("dashboardId");
          });
        },
      );
    });
    H.visitDashboard("@dashboardId");

    cy.log("Escape should close the date filter (metabase#54353)");
    cy.findByLabelText("Date").click();
    H.popover()
      .findByText(/Previous 12 months/i)
      .click();

    cy.findByLabelText("Date").click();
    H.popover().should("be.visible");

    cy.realPress("Escape");
    cy.findByRole("dialog").should("not.exist");

    cy.log("Enter should open a filter widget (metabase#52674)");
    H.main().button("Number").focus();
    cy.realPress("Enter");
    H.popover().should("be.visible");

    cy.log("Close the popover");
    H.main().button("Number").click();
    cy.findByRole("dialog").should("not.exist");

    cy.log("Space should open a filter widget (metabase#52674)");
    H.main().button("Number").focus();
    cy.realPress("Space");
    H.popover().should("be.visible");
  });
});

describe("issue 44937", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("readonly");
  });

  it("dashboard empty state should not suggest creating a new question when users have no creation permission (metabase#44937)", () => {
    cy.visit("/");
    H.newButton().click();
    H.popover().findByText("Dashboard").click();
    H.modal().within(() => {
      cy.findByPlaceholderText("What is the name of your dashboard?").type(
        "my dashboard",
      );
      cy.button("Create").click();
    });

    H.main().findByText(
      "Browse your collections to find and add existing questions.",
    );

    cy.button("Add a chart").click();
    H.sidebar().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Orders").click();
    });
    H.getDashboardCards().should("have.length", 1);

    H.createNewTab();

    H.main().findByText(
      "Browse your collections to find and add existing questions.",
    );
  });
});

describe("issue 65908", () => {
  const dateParameters = {
    default: "2030-01-01~",
    id: "d3b78b27",
    name: "Date Filter",
    slug: "date_filter",
    type: "date/all-options",
  };

  function createDashcard({
    index,
    questionId,
    hideEmptyResults,
    withParameterMappings,
  }) {
    const cardHeightInRows = 10;

    return {
      col: 0,
      row: cardHeightInRows * index,
      size_x: 24,
      size_y: cardHeightInRows,
      card_id: questionId,
      visualization_settings: {
        "card.hide_empty": hideEmptyResults,
      },
      parameter_mappings: withParameterMappings
        ? [
            {
              parameter_id: dateParameters.id,
              card_id: questionId,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ]
        : undefined,
    };
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const dashboardDetails = {
      name: "Dashboard with empty result cards",
      parameters: [dateParameters],
    };

    const questionDetails = {
      name: "Orders question",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    H.createDashboardWithQuestions({
      dashboardDetails,
      questions: [questionDetails],
    }).then(({ dashboard, questions }) => {
      const [question] = questions;
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          createDashcard({
            index: 0,
            questionId: question.id,
            hideEmptyResults: true,
            withParameterMappings: true,
          }),
          createDashcard({
            index: 1,
            questionId: question.id,
            hideEmptyResults: true,
            withParameterMappings: true,
          }),
          createDashcard({
            index: 2,
            questionId: question.id,
            hideEmptyResults: true,
            withParameterMappings: true,
          }),
          createDashcard({
            index: 3,
            questionId: question.id,
            hideEmptyResults: false,
            withParameterMappings: false,
          }),
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
    });
  });

  it("should not take into account the height of cards with no results when calculating dashboard height (metabase#65908)", () => {
    cy.get("@dashboardId").then((dashboardId) => {
      H.visitDashboard(dashboardId);

      cy.findByDisplayValue("Dashboard with empty result cards").should(
        "be.visible",
      );

      H.getDashboardCard().within(() => {
        cy.findByText("Orders question").should("be.visible");
        cy.log("Checks for the subtotal value from the first row");
        cy.findByText("37.65").should("be.visible");
      });

      cy.findByRole("main").should(($main) => {
        // 4 cards take about 2000px in height, so only 1 card should definitely take less than 1000px
        expect($main[0].scrollHeight).to.be.lessThan(1000);
      });
    });
  });
});

describe("issue 12926", () => {
  const filterDisplayName = "F";
  const queryResult = 42;
  const parameterValue = 10;
  const questionDetails = {
    name: "Question 1",
    native: {
      query: `SELECT ${queryResult} [[+{{F}}]] as ANSWER`,
      "template-tags": {
        F: {
          type: "number",
          name: "F",
          id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
          "display-name": filterDisplayName,
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should load a card with correct parameters after a save retriggers a non saved query with a negative id (metabase#12926)", () => {
    H.createNativeQuestion(questionDetails);

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
    });

    H.editDashboard();

    H.openQuestionsSidebar();
    H.sidebar().findByText(questionDetails.name).click();

    H.setFilter("Number", "Equal to");
    H.sidebar().findByText("No default").click();
    H.popover().findByPlaceholderText("Enter a number").type(parameterValue);
    H.popover().findByText("Add filter").click();

    H.getDashboardCard().findByText("Select…").click();
    H.popover().contains(filterDisplayName).eq(0).click();

    H.saveDashboard();

    H.getDashboardCard().findByText(queryResult + parameterValue);
  });
});
