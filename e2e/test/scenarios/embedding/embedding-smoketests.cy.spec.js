const { H } = cy;
import { METABASE_SECRET_KEY } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const standalonePath = "/admin/embedding/static";

// These tests will run on both OSS and EE instances. Both without a token!
describe("scenarios > embedding > smoke tests", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("show-sdk-embed-terms", false);
  });

  it("should not offer to share or embed models (metabase#20815)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });

    cy.visit(`/model/${ORDERS_QUESTION_ID}`);
    cy.wait("@dataset");

    H.sharingMenuButton().should("not.exist");

    cy.findByTestId("view-footer").within(() => {
      cy.icon("download").should("exist");
    });
  });

  context("embedding disabled", () => {
    beforeEach(() => {
      // We enable embedding by default in the default snapshot that all tests are using.
      // That's why we need to disable it here.
      resetEmbedding();
    });

    it("should show the sdk upsell link in oss", () => {
      cy.visit("/admin/embedding/modular");

      mainPage().within(() => {
        cy.findByRole("link", { name: "Try for free" })
          .should("have.attr", "href")
          .and(
            "eq",
            "https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=upsell&utm_campaign=embedded-analytics-js&utm_content=embedding-page&source_plan=oss",
          );
      });
    });

    it("should not let you embed the question", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);

      ensureEmbeddingIsDisabled();
    });

    it("should not let you embed the dashboard", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);

      ensureEmbeddingIsDisabled();
    });
  });

  context("embedding enabled", () => {
    const ids = {
      question: ORDERS_QUESTION_ID,
      dashboard: ORDERS_DASHBOARD_ID,
    };
    ["question", "dashboard"].forEach((object) => {
      it(`should be able to publish/embed and then unpublish a ${object} without filters`, () => {
        cy.request("PUT", "/api/setting/enable-embedding-static", {
          value: true,
        });
        const embeddableObject = object === "question" ? "card" : "dashboard";
        const objectName =
          object === "question" ? "Orders" : "Orders in a dashboard";

        cy.intercept("PUT", `/api/${embeddableObject}/${ids[object]}`).as(
          "embedObject",
        );
        cy.intercept("GET", `/api/${embeddableObject}/embeddable`).as(
          "currentlyEmbeddedObject",
        );

        visitAndEnableSharing(object);

        H.modal().within(() => {
          cy.findByRole("tab", { name: "Look and Feel" }).click();

          cy.findByText("Theme");
          cy.findByLabelText(
            object === "dashboard" ? "Dashboard title" : "Question title",
          );
          cy.findByLabelText(
            object === "dashboard" ? "Dashboard border" : "Question border",
          );
          cy.findByText(
            (_, element) =>
              element.textContent ===
              "You can change the font with a paid plan.",
          );

          cy.findByText(
            object === "dashboard"
              ? "Results (csv, xlsx, json, png)"
              : "Download (csv, xlsx, json, png)",
          ).should("not.exist");
          cy.findByRole("button", { name: "Export as PDF" }).should(
            "not.exist",
          );

          cy.findByRole("tab", { name: "Parameters" }).click();

          cy.findByText(
            `This ${object} doesn't have any parameters to configure yet.`,
          );

          cy.findByText(
            `You will need to publish this ${object} before you can embed it in another application.`,
          );

          cy.button("Publish").click();

          cy.wait("@embedObject");
        });

        H.visitIframe();

        cy.findByTestId("embed-frame").within(() => {
          cy.findByRole("heading", { name: objectName });
          cy.findAllByRole("gridcell").contains("37.65");
        });

        cy.findByRole("contentinfo").within(() => {
          cy.findByRole("link", { name: "Powered by Metabase" })
            .should("have.attr", "href")
            .and("contain", "https://www.metabase.com/powered-by-metabase");
        });

        cy.log(
          `Make sure the ${object} shows up in the standalone embeds page`,
        );
        cy.signInAsAdmin();
        cy.visit(standalonePath);
        cy.wait("@currentlyEmbeddedObject");

        const sectionTestId = {
          dashboard: "-embedded-dashboards-setting",
          question: "-embedded-questions-setting",
        }[object];

        cy.findByTestId(sectionTestId)
          .find("tbody tr")
          .should("have.length", 1)
          .and("contain", objectName);

        cy.log(`Unpublish ${object}`);
        visitAndEnableSharing(object, false);

        H.modal().within(() => {
          cy.findByText(
            `This ${object} is published and ready to be embedded.`,
          );
          cy.button("Unpublish").click();

          cy.wait("@embedObject");

          cy.findByRole("tab", { name: "Parameters" }).click();
        });

        H.visitIframe();

        cy.findByTestId("embed-frame").findByText(
          "Embedding is not enabled for this object.",
        );

        cy.signInAsAdmin();
        cy.visit(standalonePath);
        cy.wait("@currentlyEmbeddedObject");

        mainPage()
          .findAllByText(/No (questions|dashboards) have been embedded yet./)
          .should("have.length", 2);
      });
    });

    it("should be able to publish/embed a dashboard with a dashboard question saved within it", () => {
      H.createQuestion({
        name: "Total Orders",
        dashboard_id: ORDERS_DASHBOARD_ID,
        database_id: SAMPLE_DATABASE.id,
        query: {
          "source-table": SAMPLE_DATABASE.ORDERS_ID,
          aggregation: [["count"]],
        },
        display: "scalar",
        enable_embedding: true,
      });

      cy.request("PUT", "/api/setting/enable-embedding-static", {
        value: true,
      });

      cy.intercept("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`).as(
        "embedObject",
      );
      cy.intercept("GET", "/api/dashboard/embeddable").as(
        "currentlyEmbeddedObject",
      );

      visitAndEnableSharing("dashboard");

      H.modal().within(() => {
        cy.findByRole("tab", { name: "Look and Feel" }).click();
        cy.button("Publish").click();

        cy.wait("@embedObject");
      });

      H.visitIframe();
      cy.url().should("contain", "/embed/dashboard/");

      cy.findByTestId("embed-frame").within(() => {
        cy.findByRole("heading", { name: "Orders in a dashboard" });
        cy.findByText("Total Orders");
        cy.findByText("18,760");
      });
    });

    it("should regenerate embedding token and invalidate previous embed url", () => {
      cy.request("PUT", "/api/setting/enable-embedding-static", {
        value: true,
      });

      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        enable_embedding: true,
      });
      visitAndEnableSharing("question");

      H.modal().within(() => {
        cy.findByRole("tab", { name: "Parameters" }).click();

        cy.findByText("Preview").click();
      });

      cy.document().then((doc) => {
        const iframe = doc.querySelector("iframe");

        cy.signOut();
        cy.visit(iframe.src);

        cy.findByTestId("embed-frame").contains("37.65");

        cy.signInAsAdmin();
        cy.visit(standalonePath);

        cy.findByTestId("embedding-secret-key-setting")
          .findByRole("textbox")
          .should("have.value", METABASE_SECRET_KEY);

        cy.button("Regenerate key").click();

        H.modal().within(() => {
          cy.intercept("GET", "/api/util/random_token").as("regenerateKey");
          cy.findByRole("heading", { name: "Regenerate embedding key?" });
          cy.findByText(
            "This will cause existing embeds to stop working until they are updated with the new key.",
          );
          cy.findByText("Are you sure you want to do this?");
          cy.button("Yes").click();
        });

        cy.wait("@regenerateKey").then(
          ({
            response: {
              body: { token },
            },
          }) => {
            expect(token).to.have.length(64);
            expect(token).to.not.eq(METABASE_SECRET_KEY);

            cy.findByDisplayValue(token);
          },
        );

        cy.log("Visit the embedding url generated with the old token");
        cy.visit(iframe.src);
        cy.findByTestId("embed-frame").findByText(
          "Message seems corrupt or manipulated",
        );
      });
    });
  });

  it("should navigate to Modular Embedding when clicking Embedding in admin and show sidebar links", () => {
    cy.log("Navigate to Embedding admin section");
    cy.visit("/admin/embedding");

    cy.log("Check that we're on the modular embedding page");
    cy.url().should("include", "/admin/embedding/modular");
    cy.get("main").findByText("Modular embedding").should("be.visible");

    cy.log("Verify sidebar contains static smbedding link");
    cy.findByTestId("admin-layout-sidebar")
      .findByRole("link", { name: /Static/ })
      .should("have.attr", "href", "/admin/embedding/static");

    cy.log("Verify sidebar does not contain interactive embedding");
    cy.findByTestId("admin-layout-sidebar")
      .findByRole("link", { name: /Interactive/ })
      .should("not.exist");

    cy.log("Verify sidebar does not contain setup guide");
    cy.findByTestId("admin-layout-sidebar")
      .findByRole("link", { name: /Setup/ })
      .should("not.exist");

    cy.log("Verify upsell icon is present in sidebar");
    cy.findByTestId("admin-layout-sidebar")
      .findByLabelText("gem icon")
      .should("exist");
  });
});

function resetEmbedding() {
  H.updateSetting("enable-embedding-static", false);
  H.updateSetting("embedding-secret-key", null);
}

function ensureEmbeddingIsDisabled() {
  H.openSharingMenu();
  H.sharingMenu()
    .findByRole("menuitem", { name: "Embed" })
    .should("be.enabled")
    .click();
  H.modal()
    .findByRole("article", { name: "Static embedding" })
    .within(() => {
      cy.findByText("Disabled.").should("be.visible");
      cy.findByText("Enable in admin settings").should("be.visible");
    });
}

function visitAndEnableSharing(object, acceptTerms = true) {
  if (object === "question") {
    H.visitQuestion(ORDERS_QUESTION_ID);
  }

  if (object === "dashboard") {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
  }

  H.openStaticEmbeddingModal({ acceptTerms });
}

function mainPage() {
  return cy.findByTestId("admin-layout-content");
}
