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
import { cancelConfirmationModal } from "e2e/test/scenarios/admin/performance/helpers/modals-helpers";
import { GRID_WIDTH } from "metabase/lib/dashboard_grid";
import {
  createMockVirtualCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";

import { interceptPerformanceRoutes } from "../admin/performance/helpers/e2e-performance-helpers";
import {
  adaptiveRadioButton,
  cacheStrategySidesheet,
  durationRadioButton,
  openSidebarCacheStrategyForm,
} from "../admin/performance/helpers/e2e-strategy-form-helpers";

const { H } = cy;

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

// There's a race condition when saving a dashboard
// and then immediately editing it again. After saving,
// we exit the edit mode and that can happen after
// `H.editDashboard` is called for some reason
const DASHBOARD_SAVE_WAIT_TIME = 450;

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("create", () => {
    it("new dashboard UI flow", { tags: "@smoke" }, () => {
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

      H.entityPickerModal().findByText("New dashboard").click();
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
      it("should be possible via questions sidebar", () => {
        H.editDashboard();
        H.openQuestionsSidebar();

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
        H.createDashboard({
          name: "dashboard in root collection",
        }).then(({ body: { id: dashboardId } }) => {
          H.visitDashboard(dashboardId);
        });

        cy.log("assert that personal collections are not visible");
        H.editDashboard();
        H.openQuestionsSidebar();
        H.sidebar().within(() => {
          cy.findByText("Our analytics").should("be.visible");
          cy.findByText(myPersonalCollection).should("not.exist");
          cy.findByText(collectionInRoot.name).should("be.visible");
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
          cy.findByText(myPersonalCollection).should("not.exist");
          cy.findByText(collectionInRoot.name).should("be.visible");
        });
      });

      it("should save a dashboard after adding a saved question from an empty state (metabase#29450)", () => {
        cy.findByTestId("dashboard-empty-state").within(() => {
          cy.findByText("This dashboard is empty");
          cy.findByText("Add a chart").click();
        });

        H.sidebar().findByText("Orders, Count").click();

        H.saveDashboard();

        H.getDashboardCards()
          .should("have.length", 1)
          .and("contain", "Orders, Count")
          .and("contain", "18,760");
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

      it("should allow navigating to the notebook editor directly from a dashboard card", () => {
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.showDashboardCardActions();
        H.getDashboardCardMenu().click();
        H.popover().findByText("Edit question").should("be.visible").click();
        cy.findByRole("button", { name: "Visualize" }).should("be.visible");
      });

      it("should allow navigating to the model editor directly from a dashboard card", () => {
        H.createQuestionAndDashboard({
          questionDetails: {
            name: "orders",
            type: "model",
            query: {
              "source-table": ORDERS_ID,
            },
          },
          dashboardDetails: {
            name: "Dashboard",
          },
        }).then(({ body: { dashboard_id, card } }) => {
          cy.wrap(`${card.id}-${card.name}`).as("slug");
          H.visitDashboard(dashboard_id);
        });

        H.showDashboardCardActions();
        H.getDashboardCardMenu().click();
        H.popover().findByText("Edit model").should("be.visible").click();
        cy.get("@slug").then((slug) => {
          cy.location("pathname").should("eq", `/model/${slug}/query`);
        });
      });

      it("should allow navigating to the metric editor directly from a dashboard card", () => {
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
            name: "Dashboard",
          },
        }).then(({ body: { dashboard_id, card } }) => {
          cy.wrap(`${card.id}-${card.name}`).as("slug");
          H.visitDashboard(dashboard_id);
        });

        H.showDashboardCardActions();
        H.getDashboardCardMenu().click();
        H.popover().findByText("Edit metric").should("be.visible").click();
        cy.get("@slug").then((slug) => {
          cy.location("pathname").should("eq", `/metric/${slug}/query`);
        });
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

      it("should not have markdown content overflow the description area (metabase#31326)", () => {
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

      it("should prevent entering a title longer than 254 chars", () => {
        const longTitle = "A".repeat(256);
        cy.findByTestId("dashboard-name-heading")
          .as("dashboardInput")
          .clear()
          .type(longTitle, { delay: 0 })
          .blur();
        cy.get("@dashboardInput").invoke("text").should("have.length", 254);
      });
    });

    it(
      "should not allow dashboard editing on small screens",
      { viewportWidth: 480, viewportHeight: 800 },
      () => {
        cy.findByLabelText("Edit dashboard").should("not.be.visible");

        cy.viewport(660, 800);

        cy.findByLabelText("Edit dashboard").should("be.visible").click();
        cy.findByTestId("edit-bar").findByText(
          "You're editing this dashboard.",
        );
      },
    );

    it(
      "shows sorted cards on mobile screens",
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
      },
    );

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

  describe("iframe cards", () => {
    it("should handle various iframe and URL inputs", () => {
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

      H.createDashboard().then(({ body: { id } }) => {
        H.visitDashboard(id);
      });

      H.editDashboard();

      testCases.forEach(({ input, expected }, index) => {
        H.addIFrameWhileEditing(input);
        cy.button("Done").click();
        validateIFrame(expected, index);
      });
    });

    it("should respect allowed-iframe-hosts setting", () => {
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

      H.editIFrameWhileEditing(
        0,
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
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
  });

  it("should add a filter", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    // Adding location/state doesn't make much sense for this case,
    // but we're testing just that the filter is added to the dashboard
    H.setFilter("Location", "Is");

    H.getDashboardCard().findByText("Select…").click();

    H.popover().findByText("State").click();

    cy.icon("close");
    cy.button("Done").click();

    H.saveDashboard();

    cy.log("Assert that the selected filter is present in the dashboard");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Location", { exact: false }).should("be.visible");
  });

  it("should link filters to custom question with filtered aggregate data (metabase#11007)", () => {
    // programmatically create and save a question as per repro instructions in #11007
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You're editing this dashboard.").should("not.exist");
  });

  it("should update a dashboard filter by clicking on a map pin (metabase#13597)", () => {
    H.createQuestion({
      name: "13597",
      query: {
        "source-table": PEOPLE_ID,
        limit: 2,
      },
      display: "map",
    }).then(({ body: { id: questionId } }) => {
      H.createDashboard().then(({ body: { id: dashboardId } }) => {
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

        H.addOrUpdateDashboardCard({
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

        H.visitDashboard(dashboardId);
        H.mapPinIcon().eq(0).click({ force: true });
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

    H.createNativeQuestionAndDashboard({ questionDetails }).then(
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

        H.visitDashboard(dashboard_id);
      },
    );

    // Add cross-filter click behavior manually
    cy.icon("pencil").click();
    H.showDashboardCardActions();
    cy.findByTestId("dashboardcard-actions-panel").within(() => {
      cy.icon("click").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("COUNT(*)").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Update a dashboard filter").click();

    checkOptionsForFilter("ID");
    checkOptionsForFilter("Category");
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
          cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
            dashcards: [
              {
                id: ORDERS_DASHBOARD_DASHCARD_ID,
                card_id: ORDERS_QUESTION_ID,
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

          cy.intercept(
            "GET",
            `/api/dashboard/${ORDERS_DASHBOARD_ID}/query_metadata*`,
          ).as("queryMetadata");
        });
      },
    );
    cy.signInAsNormalUser();
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    cy.wait("@queryMetadata");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders in a dashboard");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });

  it("should be possible to scroll vertically after fullscreen layer is closed (metabase#15596)", () => {
    // Make this dashboard card extremely tall so that it spans outside of visible viewport
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      dashcards: [
        {
          id: ORDERS_DASHBOARD_DASHCARD_ID,
          card_id: ORDERS_QUESTION_ID,
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

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
    assertScrollBarExists();

    H.openLegacyStaticEmbeddingModal({
      resource: "dashboard",
      resourceId: ORDERS_DASHBOARD_ID,
    });

    H.modal().within(() => {
      cy.icon("close").click();
    });
    H.modal().should("not.exist");
    assertScrollBarExists();
  });

  it("should support auto-scrolling to a dashcard via a url hash param", () => {
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
        cy.visit(`/dashboard/${dashboard.id}}`);
        cy.findByText(TARGET_TEXT).should("not.be.visible");

        cy.log("should scroll into view w/ scrollTo hash param");
        cy.visit(`/dashboard/${dashboard.id}#scrollTo=${targetCard.id}`);
        cy.location("hash").should("match", /scrollTo=\d+/); // url should have hash param to auto-scroll
        cy.location("hash").should("not.include", "scrollTo"); // scrollTo param should get removed
        cy.findByText(TARGET_TEXT).should("be.visible");
      },
    );
  });

  it("should allow making card hide when it is empty", () => {
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
      }).click({ force: true });
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

  describe("warn before leave", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/card/*/query_metadata").as("queryMetadata");
    });

    it("should warn a user before leaving after adding, editing, or removing a card on a dashboard", () => {
      cy.visit("/");
      cy.findByTestId("loading-indicator").should("not.exist");

      cy.findByTestId("home-page").should(
        "contain",
        "Try out these sample x-rays to see what Metabase can do.",
      );

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
      H.saveDashboard({ waitMs: DASHBOARD_SAVE_WAIT_TIME });

      // remove
      H.editDashboard();
      H.removeDashboardCard();
      assertPreventLeave();
    });

    it("should warn a user before leaving after adding, removing, moving, or duplicating a tab", () => {
      cy.visit("/");
      cy.findByTestId("loading-indicator").should("not.exist");

      // add tab
      createNewDashboard();
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
      H.saveDashboard({ waitMs: DASHBOARD_SAVE_WAIT_TIME });

      // rename tab
      H.editDashboard();
      H.renameTab("Tab 2", "Foo tab");
      assertPreventLeave();
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

describe("scenarios > dashboard", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/activity/recents?*").as("recentViews");
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should be possible to add an iframe card", () => {
    H.updateSetting("allowed-iframe-hosts", "*");
    H.createDashboard({ name: "iframe card" }).then(({ body: { id } }) => {
      H.visitDashboard(id);

      H.editDashboard();
      H.addIFrameWhileEditing("https://example.com");
      cy.findByTestId("dashboardcard-actions-panel").should("not.exist");
      cy.button("Done").click();
      H.getDashboardCard(0).realHover();
      cy.findByTestId("dashboardcard-actions-panel").should("be.visible");
      validateIFrame("https://example.com");
      H.saveDashboard();
      validateIFrame("https://example.com");

      H.expectUnstructuredSnowplowEvent({
        event: "new_iframe_card_created",
        target_id: id,
        event_detail: "example.com",
      });
    });
  });

  it("saving a dashboard should track a 'dashboard_saved' snowplow event", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    const newTitle = "New title";
    cy.findByTestId("dashboard-name-heading").clear().type(newTitle).blur();
    H.saveDashboard();
    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_saved",
    });
  });

  it("should allow users to add link cards to dashboards", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    cy.findByLabelText("Add a link or iframe").click();
    H.popover().findByText("Link").click();

    cy.wait("@recentViews");

    cy.findByTestId("custom-edit-text-link")
      .findByPlaceholderText("https://example.com")
      .type("Orders");

    H.popover().within(() => {
      cy.findByText(/Loading/i).should("not.exist");
      cy.findByText("Orders in a dashboard").click();
    });

    cy.findByTestId("entity-edit-display-link").findByText(
      /orders in a dashboard/i,
    );

    H.saveDashboard();

    cy.findByTestId("entity-view-display-link").findByText(
      /orders in a dashboard/i,
    );

    H.expectUnstructuredSnowplowEvent({
      event: "new_link_card_created",
    });
  });

  it("should track enabling the hide empty cards setting", () => {
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
    });
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
    H.popover().findByText("Full width").click();
    H.assertDashboardFullWidth();
    H.expectUnstructuredSnowplowEvent({
      event: "dashboard_width_toggled",
      full_width: true,
    });

    // confirm it saves the state after saving and refreshing
    H.saveDashboard();
    cy.reload();
    H.assertDashboardFullWidth();

    // toggle back to fixed
    H.editDashboard();
    cy.findByLabelText("Toggle width").click();
    H.popover().findByText("Full width").click();
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
    });
  });
});

function checkOptionsForFilter(filter) {
  cy.findByText("Available filters").parent().contains(filter).click();
  H.popover()
    .should("contain", "Columns")
    .and("contain", "COUNT(*)")
    .and("not.contain", "Dashboard filters");

  // Get rid of the open popover to be able to select another filter
  // Uses force: true because the popover is covering this text.
  cy.findByText("Pick one or more filters to update").click({ force: true });
}

function assertScrollBarExists() {
  cy.get("body").then(($body) => {
    const bodyWidth = $body[0].getBoundingClientRect().width;
    cy.window().its("innerWidth").should("be.gte", bodyWidth);
  });
}

describe("LOCAL TESTING ONLY > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  /**
   * WARNING:
   *    https://github.com/metabase/metabase/issues/15656
   *    - We are currently not able to test translations in CI
   *    - DO NOT unskip this test even after the issue is fixed
   *    - To be used for local testing only
   *    - Make sure you have translation resources built first.
   *        - Run `./bin/i18n/build-translation-resources`
   *        - Then start the server and Cypress tests
   */

  it(
    "dashboard filter should not show placeholder for translated languages (metabase#15694)",
    { tags: "@skip" },
    () => {
      cy.request("GET", "/api/user/current").then(
        ({ body: { id: USER_ID } }) => {
          cy.request("PUT", `/api/user/${USER_ID}`, { locale: "fr" });
        },
      );
      H.createQuestionAndDashboard({
        questionDetails: {
          name: "15694",
          query: { "source-table": PEOPLE_ID },
        },
        dashboardDetails: {
          parameters: [
            {
              name: "Location",
              slug: "location",
              id: "5aefc725",
              type: "string/=",
              sectionId: "location",
            },
          ],
        },
      }).then(({ body: { card_id, dashboard_id } }) => {
        H.addOrUpdateDashboardCard({
          card_id,
          dashboard_id,
          card: {
            parameter_mappings: [
              {
                parameter_id: "5aefc725",
                card_id,
                target: ["dimension", ["field", PEOPLE.STATE, null]],
              },
            ],
          },
        });

        cy.visit(`/dashboard/${dashboard_id}?location=AK&location=CA`);
        H.filterWidget().contains(/\{0\}/).should("not.exist");
      });
    },
  );
});

describe("scenarios > dashboard > caching", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  /**
   * @note There is a similar test for the cache config form that appears in the question sidebar.
   * It's in the Cypress describe block labeled "scenarios > question > caching"
   */
  it("can configure cache for a dashboard, on an enterprise instance", () => {
    interceptPerformanceRoutes();
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    openSidebarCacheStrategyForm("dashboard");

    H.sidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      durationRadioButton().click();
      cy.findByLabelText("Cache results for this many hours").type("48");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.log(
        "Check that the newly chosen cache invalidation policy - Duration - is now visible in the sidebar",
      );
      cy.findByLabelText(/When to get new results/).should(
        "contain",
        "Duration",
      );
      cy.findByLabelText(/When to get new results/).click();
      adaptiveRadioButton().click();
      cy.findByLabelText(/Minimum query duration/).type("999");
      cy.findByRole("button", { name: /Save/ }).click();
      cy.wait("@putCacheConfig");
      cy.findByLabelText(/When to get new results/).should(
        "contain",
        "Adaptive",
      );
    });
  });

  /**
   * @note There is a similar test for closing the cache form when it's dirty
   * It's in the Cypress describe block labeled "scenarios > question > caching"
   */
  it("should guard closing caching form if it's dirty on different actions", () => {
    interceptPerformanceRoutes();
    /**
     * we need to populate the history via react router by clicking route's links
     * in order to imitate a user who clicks "back" and "forward" button
     */
    cy.visit("/");
    cy.findByTestId("main-navbar-root").findByText("Our analytics").click();
    cy.findByTestId("collection-table")
      .findByText("Orders in a dashboard")
      .click();

    openSidebarCacheStrategyForm("dashboard");

    cacheStrategySidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      durationRadioButton().click();
    });
    // Action 1: clicking on cross button
    cacheStrategySidesheet().findByRole("button", { name: /Close/ }).click();
    cancelConfirmationModal();
    // Action 2: ESC button
    cy.get("body").type("{esc}");
    cancelConfirmationModal();
    // Action 3: click outside
    // When a user clicks somewhere outside he basically clicks on the top one
    cy.findAllByTestId("modal-overlay")
      .should("have.length.gte", 1)
      .last()
      .click();
    cancelConfirmationModal();
    // Action 4: browser's Back action
    cy.go("back");
    cancelConfirmationModal();
  });

  it("can click 'Clear cache' for a dashboard", () => {
    interceptPerformanceRoutes();
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    openSidebarCacheStrategyForm("dashboard");

    H.sidesheet().within(() => {
      cy.findByText(/Caching settings/).should("be.visible");
      cy.findByRole("button", {
        name: /Clear cache for this dashboard/,
      }).click();
    });

    cy.findByTestId("confirm-modal").within(() => {
      cy.findByRole("button", { name: /Clear cache/ }).click();
    });
    cy.wait("@invalidateCache");
    H.sidesheet().within(() => {
      cy.findByText("Cache cleared").should("be.visible");
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

  it("should let admins view all cards in a dashboard", () => {
    H.visitDashboard(dashboardId);
    // Admin can see both questions
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("First Question");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("foo");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Second Question");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("bar");
  });

  it("should display dashboards with some cards locked down", () => {
    cy.signIn("nodata");
    H.visitDashboard(dashboardId);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don't have permission to see this card.");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Second Question");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("bar");
  });

  it("should display an error if they don't have perms for the dashboard", () => {
    cy.signIn("nocollection");
    H.visitDashboard(dashboardId);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sorry, you don’t have permission to see that.");
  });
});

describe("scenarios > dashboard > entity id support", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("when loading `/dashboard/entity/${entity_id}`, it should redirect to `/dashboard/${id}` and display the dashboard correctly", () => {
    cy.visit(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}`);

    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}`);

    // Making sure the dashboard loads
    H.main().findByText("Orders in a dashboard").should("be.visible");
  });

  it("when loading `/dashboard/entity/${entity_id}?tab=${tab_entity_id}`, it should redirect to `/dashboard/${id}?tab=${tab_id}` and select the correct tab", () => {
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
  });

  it("it should preserve search params such as filters when redirecting", () => {
    // Add filter to the dashboard
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [
        {
          id: "abc123",
          name: "Text",
          slug: "text",
          type: "string/=",
        },
      ],
    });

    // Connect filter to the existing card
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
              parameter_id: "abc123",
              card_id: ORDERS_QUESTION_ID,
              target: ["dimension", ["field", ORDERS.ID, null]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    // Visit the dashboard via the entity id path and verify that the filter is preserved
    cy.visit(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}?text=123`);

    cy.url()
      .should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}`)
      .and("contain", "text=123");

    H.filterWidget().should("contain", "Text").and("contain", "123");
  });

  it("when loading `/dashboard/entity/${entity_id}/move`, it should redirect to `/dashboard/${id}/move` and show the move modal", () => {
    cy.visit(`/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}/move`);
    cy.url().should("contain", `/dashboard/${ORDERS_DASHBOARD_ID}/move`);

    H.main().findByText("Orders in a dashboard").should("be.visible");
    H.modal().findByText("Move dashboard to…").should("be.visible");
  });

  it("when loading `/dashboard/entity/${non existing entity id}`, it should show a 404 page", () => {
    const nonExistingEntityId = "x".repeat(21);
    cy.visit(`/dashboard/entity/${nonExistingEntityId}`);

    H.main().findByText("We're a little lost...").should("be.visible");
  });

  it("when loading `/dashboard/entity/${non existing entity id}`, it should show a 404 page even if the entity id starts with a number", () => {
    const nonExistingEntityId = "12".padEnd(21, "x");
    cy.visit(`/dashboard/entity/${nonExistingEntityId}`);

    H.main().findByText("We're a little lost...").should("be.visible");
  });

  it("when loading `/dashboard/entity/${entity id}?tab=${non existing tab entity id}`, it should show a 404 page even if the entity id starts with a number", () => {
    const nonExistingEntityId = "12".padEnd(21, "x");
    cy.visit(
      `/dashboard/entity/${ORDERS_DASHBOARD_ENTITY_ID}?tab=${nonExistingEntityId}`,
    );

    H.main().findByText("We're a little lost...").should("be.visible");
  });
});

function validateIFrame(src, index = 0) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.getDashboardCards()
    .get("iframe")
    .eq(index)
    .should("have.attr", "src", src)
    .and(
      "have.attr",
      "sandbox",
      "allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts",
    )
    .and("not.have.attr", "onload");
}
