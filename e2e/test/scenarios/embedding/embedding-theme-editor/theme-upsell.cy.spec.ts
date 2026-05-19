const { H } = cy;

describe("scenarios > embedding > themes > upsell", () => {
  describe("OSS", { tags: "@OSS" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("shows the upsell with Metabase Pro copy and an external upgrade link", () => {
      cy.visit("/admin/embedding/themes");

      cy.log("nav label has an upsell gem");
      cy.findByTestId("admin-layout-sidebar")
        .findByRole("link", { name: /Themes/ })
        .within(() => {
          cy.icon("gem").should("be.visible");
        });

      H.main().within(() => {
        cy.log("upsell copy matches the Figma");
        cy.findByText("Metabase Pro").should("be.visible");
        cy.findByRole("heading", { name: "Create custom themes" }).should(
          "be.visible",
        );
        cy.findByText(
          "Fine-tune the appearance of your embedded content with colors and fonts.",
        ).should("be.visible");

        cy.log("CTA is an external upgrade link for non-hosted instances");
        cy.findByRole("link", { name: "Upgrade to Pro" })
          .should("be.visible")
          .and("have.attr", "href")
          .and("include", "utm_campaign=embedding-themes")
          .and("include", "source_plan=oss");

        cy.log("theme listing controls are not rendered");
        cy.findByRole("button", { name: /New theme/ }).should("not.exist");
      });
    });
  });

  describe("Starter", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("starter");
    });

    it("shows the upsell with a Store Admin contact message instead of a CTA", () => {
      cy.visit("/admin/embedding/themes");

      cy.log("nav label has an upsell gem");
      cy.findByTestId("admin-layout-sidebar")
        .findByRole("link", { name: /Themes/ })
        .within(() => {
          cy.icon("gem").should("be.visible");
        });

      H.main().within(() => {
        cy.findByText("Metabase Pro").should("be.visible");
        cy.findByRole("heading", { name: "Create custom themes" }).should(
          "be.visible",
        );
        cy.findByText(
          "Fine-tune the appearance of your embedded content with colors and fonts.",
        ).should("be.visible");

        cy.log(
          "hosted, non-Store-Admin users see the contact-admin message instead of a CTA",
        );
        cy.findByText(
          /Please ask a Metabase Store Admin.*to upgrade your plan\./,
        ).should("be.visible");
        cy.findByRole("button", { name: "Upgrade to Pro" }).should("not.exist");
        cy.findByRole("link", { name: "Upgrade to Pro" }).should("not.exist");

        cy.findByRole("button", { name: /New theme/ }).should("not.exist");
      });
    });

    it("shows the Upgrade to Pro CTA when the current admin is a Metabase Store Admin", () => {
      cy.log(
        "inject the current admin into token-status.store-users so isStoreUser becomes true",
      );
      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["token-status"] = {
            ...(res.body["token-status"] ?? {}),
            "store-users": [{ email: "admin@metabase.test" }],
          };
          res.send();
        });
      });

      cy.log(
        "keep the trial check deterministic — no trial, so CTA stays 'Upgrade to Pro'",
      );
      cy.intercept("POST", "/api/ee/cloud-proxy/mb-plan-trial-up-available", {
        body: { available: false, plan_alias: "pro-cloud" },
      });

      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
        cy.findByText("Metabase Pro").should("be.visible");
        cy.findByRole("heading", { name: "Create custom themes" }).should(
          "be.visible",
        );

        cy.log("contact-admin fallback is not rendered");
        cy.findByText(/Please ask a Metabase Store Admin/).should("not.exist");

        cy.log("no trial → no trial line");
        cy.findByText(/14-day free trial/).should("not.exist");

        cy.log(
          "CTA is rendered (hosted starter as store admin → opens the upgrade modal)",
        );
        cy.findByRole("button", { name: "Upgrade to Pro" }).should(
          "be.visible",
        );
      });
    });

    it("shows the Try for free CTA and trial copy when a trial is available", () => {
      cy.log("admin is a Store Admin, so the CTA branch is taken");
      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["token-status"] = {
            ...(res.body["token-status"] ?? {}),
            "store-users": [{ email: "admin@metabase.test" }],
          };
          res.send();
        });
      });

      cy.log(
        "trial is available → CTA switches to 'Try for free' and trial line appears",
      );
      cy.intercept("POST", "/api/ee/cloud-proxy/mb-plan-trial-up-available", {
        body: { available: true, plan_alias: "pro-cloud" },
      });

      cy.visit("/admin/embedding/themes");

      H.main().within(() => {
        cy.findByText("Metabase Pro").should("be.visible");
        cy.findByRole("heading", { name: "Create custom themes" }).should(
          "be.visible",
        );

        cy.log("trial line is rendered");
        cy.findByText(
          /Get a 14-day free trial of this and other pro features/,
        ).should("be.visible");

        cy.log("button text switches to 'Try for free'");
        cy.findByRole("button", { name: "Try for free" }).should("be.visible");
        cy.findByRole("button", { name: "Upgrade to Pro" }).should("not.exist");
      });
    });
  });

  describe("Pro", { tags: "@EE" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("does not show the upsell and renders the themes listing", () => {
      cy.visit("/admin/embedding/themes");

      cy.log("nav label has no upsell gem");
      cy.findByTestId("admin-layout-sidebar")
        .findByRole("link", { name: /Themes/ })
        .within(() => {
          cy.icon("gem").should("not.exist");
        });

      H.main().within(() => {
        cy.log("upsell copy is absent");
        cy.findByText("Metabase Pro").should("not.exist");
        cy.findByRole("heading", { name: "Create custom themes" }).should(
          "not.exist",
        );

        cy.log("theme listing is rendered");
        cy.findByRole("heading", { name: "Themes" }).should("be.visible");
        cy.findByRole("button", { name: /New theme/ }).should("be.visible");
      });
    });
  });
});
