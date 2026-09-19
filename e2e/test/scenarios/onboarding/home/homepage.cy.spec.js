const { H } = cy;

import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

describe("scenarios > home > homepage", () => {
  describe("after content creation", () => {
    beforeEach(() => {
      H.restore("default");
      cy.signInAsAdmin();
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
      H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
      H.modal()
        .should("be.visible")
        .and("contain", "It's okay to play around with saved questions");

      cy.realPress("Escape");
      cy.wait("@modalDismiss");
      H.modal().should("not.exist");
    });

    it("should show an alert if applications assets are not served", () => {
      // intercepting and modifying index.html to cause a network error. originally
      // attempted to intercept the request for the JS file, but the browser
      // generally loaded it from a cache, making it difficult to force an error.
      cy.intercept(
        {
          url: "/",
        },
        (req) => {
          req.continue((res) => {
            res.body = res.body.replace(
              'src="app/dist/app-main',
              'src="bad-link.js',
            );
            return res;
          });
        },
      );

      cy.on("window:before:load", (win) => {
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
  describe("custom homepage set", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.updateSetting("custom-homepage", true);
      H.updateSetting("custom-homepage-dashboard", ORDERS_DASHBOARD_ID);
    });

    it("should not load the homepage dashboard when visiting another dashboard directly (metabase#43800)", () => {
      cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
      cy.intercept("GET", "/api/dashboard/*/query_metadata*").as(
        "getDashboardMetadata",
      );

      const dashboardName = "Test Dashboard";
      H.createDashboard({ name: dashboardName }).then(({ body: dashboard }) =>
        H.visitDashboard(dashboard.id),
      );

      H.dashboardHeader().findByText(dashboardName).should("be.visible");
      cy.get("@getDashboard.all").should("have.length", 1);
      cy.get("@getDashboardMetadata.all").should("have.length", 1);
    });
  });
});

describe("scenarios > setup", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should send snowplow events through admin settings", () => {
    cy.intercept("PUT", "/api/setting").as("putSettings");
    cy.visit("/admin/settings/general");
    cy.findByTestId("homepage-setting")
      .findByRole("radio", { name: "Dashboard" })
      .click();
    cy.wait("@putSettings");
    H.undoToast().icon("close").click();

    cy.findByTestId("custom-homepage-dashboard-setting")
      .findByRole("button")
      .should("be.visible")
      .click();

    H.entityPickerModal().findByText("Orders in a dashboard").click();

    H.undoToast().findByText("Changes saved").should("be.visible");

    H.expectUnstructuredSnowplowEvent({
      event: "homepage_dashboard_enabled",
      source: "admin",
    });
  });
});
