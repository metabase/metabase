import {
  popover,
  restore,
  visitDashboard,
  modal,
  dashboardHeader,
  navigationSidebar,
  describeWithSnowplow,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  enableTracking,
  main,
} from "e2e/support/helpers";
import { USERS } from "e2e/support/cypress_data";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";

const { admin } = USERS;

describe("scenarios > home > homepage", () => {
  beforeEach(() => {
    cy.intercept("GET", `/api/dashboard/**`).as("getDashboard");
    cy.intercept("GET", "/api/automagic-*/table/**").as("getXrayDashboard");
    cy.intercept("GET", "/api/automagic-*/database/**").as("getXrayCandidates");
    cy.intercept("GET", "/api/activity/recent_views").as("getRecentItems");
    cy.intercept("GET", "/api/activity/popular_items").as("getPopularItems");
    cy.intercept("GET", "/api/collection/*/items*").as("getCollectionItems");
    cy.intercept("POST", `/api/card/*/query`).as("getQuestionQuery");
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
      cy.addH2SampleDatabase({ name: "H2" });

      cy.visit("/");
      cy.wait("@getXrayCandidates");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Here are some explorations of");
      cy.findAllByRole("link").contains("H2");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders").click();

      cy.wait("@getXrayDashboard");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("More X-rays");
    });

    it("should allow switching between multiple schemas for x-rays", () => {
      cy.signInAsAdmin();
      cy.addH2SampleDatabase({ name: "H2" });
      cy.intercept("/api/automagic-*/database/**", getXrayCandidates());

      cy.visit("/");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Here are some explorations of the/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("public");
      cy.findAllByRole("link").contains("H2");
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
    });

    it("should display recent items", () => {
      cy.signInAsAdmin();

      visitDashboard(1);
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

    it("should display popular items for a new user", () => {
      cy.signInAsAdmin();
      visitDashboard(1);
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

    it("should not show pinned questions in recent items when viewed in a collection", () => {
      cy.signInAsAdmin();

      visitDashboard(1);
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
      cy.findByTestId("custom-homepage-setting").findByRole("switch").click();

      cy.findByTestId("custom-homepage-dashboard-setting")
        .findByRole("button")
        .click();

      popover().findByText("Orders in a dashboard").click();

      cy.findByRole("status").findByText("Saved");

      cy.log(
        "disabling custom-homepge-setting should also remove custom-homepage-dashboard-setting",
      );

      cy.findByTestId("custom-homepage-setting").findByRole("switch").click();
      cy.findByRole("status").findByText("Saved");

      cy.findByTestId("custom-homepage-setting").findByRole("switch").click();
      cy.findByTestId("custom-homepage-dashboard-setting").should(
        "contain",
        "Select a dashboard",
      );

      cy.findByTestId("custom-homepage-dashboard-setting")
        .findByRole("button")
        .click();

      popover().findByText("Orders in a dashboard").click();

      cy.findByRole("navigation").findByText("Exit admin").click();
      cy.location("pathname").should("equal", "/dashboard/1");

      // Do a page refresh and test dashboard header
      cy.visit("/");

      cy.location("pathname").should("equal", "/dashboard/1");

      dashboardHeader().within(() => {
        cy.icon("pencil").click();
        cy.findByText(/Remember that this dashboard is set as homepage/);
      });
    });

    it("should give you the option to set a custom home page using home page CTA", () => {
      cy.request("POST", "/api/collection", {
        name: "Personal nested Collection",
        color: "#509ee3",
        description: `nested 1 level`,
        parent_id: ADMIN_PERSONAL_COLLECTION_ID,
      }).then(({ body }) => {
        cy.request("POST", "/api/collection", {
          name: "Personal nested nested Collection",
          color: "#509ee3",
          description: `nested 2 levels`,
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

      popover().within(() => {
        //Ensure that personal collections have been removed
        cy.findByText("First collection").should("exist");
        cy.findByText("Your personal collection").should("not.exist");
        cy.findByText("All personal collections").should("not.exist");
        cy.findByText(/nested/i).should("not.exist");

        //Ensure that child dashboards of personal collections do not
        //appear in search
        cy.findByRole("button", { name: /search/ }).click();
        cy.findByPlaceholderText("Search").type("das{enter}");
        cy.findByText("Orders in a dashboard").should("exist");
        cy.findByText("nested dash").should("not.exist");
        cy.findByRole("button", { name: /close/ }).click();

        cy.findByText("Orders in a dashboard").click();
      });

      modal().findByRole("button", { name: "Save" }).click();
      cy.location("pathname").should("equal", "/dashboard/1");

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
      cy.request("PUT", "/api/setting/custom-homepage-dashboard", { value: 1 });
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
      // Archive dashboard
      visitDashboard(1);
      dashboardHeader().within(() => {
        cy.findByLabelText("dashboard-menu-button").click();
      });
      popover().within(() => {
        cy.findByText("Archive").click();
      });
      modal().within(() => {
        cy.findByText("Archive").click();
      });

      // Navigate to home
      navigationSidebar().within(() => {
        cy.findByText("Home").click();
      });
      main().within(() => {
        cy.findByText("We're a little lost...").should("not.exist");
        cy.findByText("Customize").should("be.visible");
      });
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

    popover().findByText("Orders in a dashboard").click();

    cy.findByRole("status").findByText("Saved");

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

    popover().findByText("Orders in a dashboard").click();
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
