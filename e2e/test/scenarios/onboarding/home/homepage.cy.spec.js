import { USERS } from "e2e/support/cypress_data";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  describeEE,
  popover,
  restore,
  visitDashboard,
  modal,
  dashboardHeader,
  navigationSidebar,
  openNavigationSidebar,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  enableTracking,
  main,
  undoToast,
  setTokenFeatures,
  entityPickerModal,
  dashboardGrid,
  entityPickerModalTab,
  visitQuestion,
  createDashboard,
} from "e2e/support/helpers";

const { admin } = USERS;

describe("scenarios > home > homepage", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/dashboard/**").as("getDashboard");
    cy.intercept("GET", "/api/automagic-*/table/**").as("getXrayDashboard");
    cy.intercept("GET", "/api/automagic-*/database/**").as("getXrayCandidates");
    cy.intercept("GET", "/api/activity/recents?*").as("getRecentItems");
    cy.intercept("GET", "/api/activity/popular_items").as("getPopularItems");
    cy.intercept("GET", "/api/collection/*/items*").as("getCollectionItems");
    cy.intercept("POST", "/api/card/*/query").as("getQuestionQuery");
  });

  describe("after setup", () => {
    beforeEach(() => {
      restore("setup");
    });

    it("should display x-rays for the sample database", () => {
      cy.signInAsAdmin();

      cy.visit("/");
      cy.wait("@getXrayCandidates");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Try out these sample x-rays to see what Metabase can do.");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").click();

      cy.wait("@getXrayDashboard");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("More X-rays");
    });

    it("should display x-rays for a user database", () => {
      cy.signInAsAdmin();
      cy.addSQLiteDatabase();

      cy.visit("/");
      cy.wait("@getXrayCandidates");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Here are some explorations of");
      cy.findAllByRole("link").contains("sqlite");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Number With Nulls").click();

      cy.wait("@getXrayDashboard");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("More X-rays");
    });

    it("should allow switching between multiple schemas for x-rays", () => {
      cy.signInAsAdmin();
      cy.addSQLiteDatabase({ name: "sqlite" });
      cy.intercept("/api/automagic-*/database/**", getXrayCandidates());

      cy.visit("/");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Here are some explorations of the/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("public");
      cy.findAllByRole("link").contains("sqlite");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("People").should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("public").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("private").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("People");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").should("not.exist");
    });
  });

  describe("after content creation", () => {
    beforeEach(() => {
      restore("default");
      cy.signInAsAdmin();
    });

    it("should display recent items", () => {
      cy.signInAsAdmin();

      visitDashboard(ORDERS_DASHBOARD_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard");

      cy.visit("/");
      cy.wait("@getRecentItems");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick up where you left off");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard").click();
      cy.wait("@getDashboard");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders");
    });

    it("should be able to dismiss qbnewq modal using keyboard (metabase#44754)", () => {
      const randomUser = {
        email: "random@metabase.test",
        password: "12341234",
      };

      // We've already dismissed qbnewq modal for all existing users.
      cy.log("Create a new admin user and log in as that user");
      cy.request("POST", "/api/user", randomUser).then(({ body: { id } }) => {
        cy.request("PUT", `/api/user/${id}`, { is_superuser: true });
        cy.request("POST", "/api/session", {
          username: randomUser.email,
          password: randomUser.password,
        });
      });

      cy.intercept("PUT", "/api/user/*/modal/qbnewb").as("modalDismiss");
      visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      modal()
        .should("be.visible")
        .and("contain", "It's okay to play around with saved questions");

      cy.realPress("Escape");
      cy.wait("@modalDismiss");
      modal().should("not.exist");
    });

    // TODO: popular items endpoint is currently broken in OSS. Re-enable test once endpoint has been fixed.
    describeEE("EE", () => {
      it("should display popular items for a new user", () => {
        cy.signInAsAdmin();
        // Setting this to true so that displaying popular items for new users works.
        // This requires the audit-app feature to be enabled
        setTokenFeatures("all");

        visitDashboard(ORDERS_DASHBOARD_ID);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders in a dashboard");
        cy.signOut();

        cy.signInAsNormalUser();
        cy.visit("/");
        cy.wait("@getPopularItems");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Here are some popular dashboards");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders in a dashboard").click();
        cy.wait("@getDashboard");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Orders");
      });
    });

    it("should not show pinned questions in recent items when viewed in a collection", () => {
      cy.signInAsAdmin();

      visitDashboard(ORDERS_DASHBOARD_ID);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard");

      cy.visit("/collection/root");
      cy.wait("@getCollectionItems");
      pinItem("Orders, Count");
      cy.wait("@getCollectionItems");
      cy.wait("@getQuestionQuery");

      cy.visit("/");
      cy.wait("@getRecentItems");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders in a dashboard").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders, Count").should("not.exist");
    });

    it("should show an alert if applications assets are not served", () => {
      // intercepting and modifying index.html to cause a network error. originally
      // attempted to intercept the request for the JS file, but the browser
      // generally loaded it from a cache, making it difficult to force an error.
      cy.intercept(
        {
          url: "/",
        },
        req => {
          req.continue(res => {
            res.body = res.body.replace(
              'src="app/dist/app-main',
              'src="bad-link.js',
            );
            return res;
          });
        },
      );

      cy.on("window:before:load", win => {
        cy.spy(win.console, "error").as("errorConsole");
      });

      cy.visit("/");
      cy.get("@errorConsole").should(
        "have.been.calledWithMatch",
        /Could not download asset/,
      );
      cy.get("@errorConsole").should(
        "have.been.calledWithMatch",
        /bad-link\.js/,
      );
    });
  });
});

describe("scenarios > home > custom homepage", () => {
  describe("setting custom homepage", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should give you the option to set a custom home page in settings", () => {
      cy.visit("/admin/settings/general");

      cy.findByTestId("custom-homepage-setting").within(() => {
        cy.findByText("Disabled").should("exist");
        cy.findByRole("switch").click();
        cy.findByText("Enabled").should("exist");
      });

      cy.findByTestId("custom-homepage-dashboard-setting")
        .findByRole("button")
        .click();

      entityPickerModal().findByText("Orders in a dashboard").click();

      undoToast().findByText("Changes saved").should("be.visible");

      cy.findByTestId("custom-homepage-dashboard-setting").should(
        "contain",
        "Orders in a dashboard",
      );

      cy.log(
        "disabling custom-homepge-setting should also remove custom-homepage-dashboard-setting",
      );

      cy.findByTestId("custom-homepage-setting").within(() => {
        cy.findByText("Enabled").should("exist");
        cy.findByRole("switch").click();
        cy.findByText("Disabled").should("exist");
      });

      undoToast().findByText("Changes saved").should("be.visible");

      cy.findByTestId("custom-homepage-setting").within(() => {
        cy.findByText("Disabled").should("exist");
        cy.findByRole("switch").click();
        cy.findByText("Enabled").should("exist");
      });

      cy.findByTestId("custom-homepage-dashboard-setting").should(
        "contain",
        "Select a dashboard",
      );

      cy.findByTestId("custom-homepage-dashboard-setting")
        .findByRole("button")
        .click();

      entityPickerModal().findByText("Orders in a dashboard").click();

      cy.findByTestId("custom-homepage-dashboard-setting").should(
        "contain",
        "Orders in a dashboard",
      );

      cy.findByRole("navigation").findByText("Exit admin").click();
      cy.location("pathname").should(
        "equal",
        `/dashboard/${ORDERS_DASHBOARD_ID}`,
      );

      // Do a page refresh and test dashboard header
      cy.visit("/");
      cy.location("pathname").should(
        "equal",
        `/dashboard/${ORDERS_DASHBOARD_ID}`,
      );

      cy.findByLabelText("Edit dashboard").click();
      cy.findByTestId("edit-bar").findByText(
        "You're editing this dashboard. Remember that this dashboard is set as homepage.",
      );
    });

    it("should give you the option to set a custom home page using home page CTA", () => {
      cy.request("POST", "/api/collection", {
        name: "Personal nested Collection",
        description: "nested 1 level",
        parent_id: ADMIN_PERSONAL_COLLECTION_ID,
      }).then(({ body }) => {
        cy.request("POST", "/api/collection", {
          name: "Personal nested nested Collection",
          description: "nested 2 levels",
          parent_id: body.id,
        }).then(({ body }) => {
          cy.createDashboard({
            name: "nested dash",
            collection_id: body.id,
          });
        });
      });

      cy.visit("/");
      cy.get("main").findByText("Customize").click();

      modal().within(() => {
        cy.findByRole("button", { name: "Save" }).should("be.disabled");
        cy.findByText(/Select a dashboard/i).click();
      });

      entityPickerModal().within(() => {
        entityPickerModalTab("Dashboards").click();
        //Ensure that personal collections have been removed
        cy.findByText("First collection").should("exist");
        cy.findByText(/personal collection/).should("not.exist");

        //Ensure that child dashboards of personal collections do not
        //appear in search
        cy.findByPlaceholderText(/search/i).type("das{enter}");
        cy.findByText("Orders in a dashboard").should("exist");
        cy.findByText("nested dash").should("not.exist");

        cy.findByText("Orders in a dashboard").click();
      });

      modal().findByRole("button", { name: "Save" }).click();
      cy.location("pathname").should(
        "equal",
        `/dashboard/${ORDERS_DASHBOARD_ID}`,
      );

      cy.findByRole("status").within(() => {
        cy.findByText("This dashboard has been set as your homepage.").should(
          "exist",
        );
        cy.findByText(
          "You can change this in Admin > Settings > General.",
        ).should("exist");
      });
    });
  });

  describe("custom homepage set", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.request("PUT", "/api/setting/custom-homepage", { value: true });
      cy.request("PUT", "/api/setting/custom-homepage-dashboard", {
        value: ORDERS_DASHBOARD_ID,
      });
    });

    it("should not flash the homescreen before redirecting (#37089)", () => {
      cy.intercept(
        {
          url: `/api/dashboard/${ORDERS_DASHBOARD_ID}`,
          method: "GET",
          middleware: true,
        },
        req => {
          req.continue(res => {
            res.delay = 1000;
            res.send();
          });
        },
      );

      cy.visit("/");
      cy.findByRole("heading", { name: "Loading..." }).should("exist");
      cy.findByRole("heading", { name: "Loading...", timeout: 5000 }).should(
        "not.exist",
      );

      //Ensure that when the loading header is gone, we are no longer on the home page
      cy.findByTestId("home-page", { timeout: 0 }).should("not.exist");
      cy.url().should("include", "/dashboard/");
    });

    it("should redirect you if you do not have permissions for set dashboard", () => {
      cy.signIn("nocollection");
      cy.visit("/");

      cy.location("pathname").should("equal", "/");
    });

    it("should not show you a toast after it has been dismissed", () => {
      cy.visit("/");
      cy.findByRole("status").within(() => {
        cy.findByText(
          /Your admin has set this dashboard as your homepage/,
        ).should("exist");
        cy.findByText("Got it").click();
      });

      cy.log("let the dashboard load");
      dashboardHeader().findByText("Orders in a dashboard");

      cy.log("Ensure that internal state was updated");
      navigationSidebar().findByText("Home").click();
      dashboardHeader().findByText("Orders in a dashboard");

      cy.findByTestId("undo-list")
        .contains(/Your admin has set this dashboard as your homepage/)
        .should("not.exist");

      cy.log("Ensure that on refresh, the proper settings are given");
      cy.visit("/");
      dashboardHeader().findByText("Orders in a dashboard");
      cy.findByTestId("undo-list")
        .contains(/Your admin has set this dashboard as your homepage/)
        .should("not.exist");
    });

    it("should only show one toast on login", () => {
      cy.signOut();
      cy.visit("/auth/login");
      cy.findByLabelText("Email address")
        .should("be.focused")
        .type(admin.email);
      cy.findByLabelText("Password").type(admin.password);
      cy.findByRole("button", { name: /sign in/i }).click();

      cy.findByRole("status").within(() => {
        cy.contains(
          /Your admin has set this dashboard as your homepage/,
        ).should("have.length", 1);
      });
    });

    it("should show the default homepage if the dashboard was archived (#31599)", () => {
      cy.request("GET", "/api/collection/trash").then(
        ({ body: trashCollection }) => {
          cy.intercept("GET", `/api/collection/${trashCollection.id}`).as(
            "getCollection",
          );
          // Archive dashboard
          visitDashboard(ORDERS_DASHBOARD_ID);
          dashboardHeader().findByLabelText("Move, trash, and more…").click();
          popover().within(() => {
            cy.findByText("Move to trash").click();
          });
          modal().within(() => {
            cy.findByText("Move to trash").click();
          });

          cy.wait(["@getCollection"]);

          // Navigate to home
          openNavigationSidebar();
          navigationSidebar().within(() => {
            cy.findByText("Home").click();
          });
          main().within(() => {
            cy.findByText("We're a little lost...").should("not.exist");
            cy.findByText("Customize").should("be.visible");
          });
        },
      );
    });

    it("should not redirect when already on the dashboard homepage (metabase#43800)", () => {
      cy.intercept(
        "GET",
        `/api/dashboard/${ORDERS_DASHBOARD_ID}/query_metadata*`,
      ).as("getDashboardMetadata");
      cy.intercept(
        "POST",
        `/api/dashboard/${ORDERS_DASHBOARD_ID}/dashcard/*/card/*/query`,
      ).as("runDashCardQuery");

      cy.visit("/");
      dashboardGrid()
        .findAllByTestId("loading-indicator")
        .should("have.length", 0);

      cy.findByTestId("main-logo-link").click().click();
      navigationSidebar().findByText("Home").click().click();

      main()
        .findByText(/Something.s gone wrong/)
        .should("not.exist");
      cy.get("@getDashboardMetadata.all").should("have.length", 1);
      cy.get("@runDashCardQuery.all").should("have.length", 1);
      cy.location("pathname").should(
        "equal",
        `/dashboard/${ORDERS_DASHBOARD_ID}`,
      );
    });

    it("should not load the homepage dashboard when visiting another dashboard directly (metabase#43800)", () => {
      cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
      cy.intercept("GET", "/api/dashboard/*/query_metadata*").as(
        "getDashboardMetadata",
      );

      const dashboardName = "Test Dashboard";
      createDashboard({ name: dashboardName }).then(({ body: dashboard }) =>
        visitDashboard(dashboard.id),
      );

      dashboardHeader().findByText(dashboardName).should("be.visible");
      cy.get("@getDashboard.all").should("have.length", 1);
      cy.get("@getDashboardMetadata.all").should("have.length", 1);
    });
  });
});

describeWithSnowplow("scenarios > setup", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
    enableTracking();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should send snowplow events through admin settings", () => {
    cy.visit("/admin/settings/general");
    cy.findByTestId("custom-homepage-setting").findByRole("switch").click();

    cy.findByTestId("custom-homepage-dashboard-setting")
      .findByRole("button")
      .click();

    entityPickerModal().findByText("Orders in a dashboard").click();

    undoToast().findByText("Changes saved").should("be.visible");

    expectGoodSnowplowEvent({
      event: "homepage_dashboard_enabled",
      source: "admin",
    });
  });

  it("should send snowplow events through homepage", () => {
    cy.visit("/");
    cy.get("main").findByText("Customize").click();
    modal()
      .findByText(/Select a dashboard/i)
      .click();

    entityPickerModal().findByText("Orders in a dashboard").click();
    modal().findByText("Save").click();
    expectGoodSnowplowEvent({
      event: "homepage_dashboard_enabled",
      source: "homepage",
    });
  });
});

const pinItem = name => {
  cy.findByText(name).closest("tr").icon("ellipsis").click();

  popover().icon("pin").click();
};

const getXrayCandidates = () => [
  {
    id: "1/public",
    schema: "public",
    tables: [{ title: "Orders", url: "/auto/dashboard/table/1" }],
  },
  {
    id: "1/private",
    schema: "private",
    tables: [{ title: "People", url: "/auto/dashboard/table/2" }],
  },
];
