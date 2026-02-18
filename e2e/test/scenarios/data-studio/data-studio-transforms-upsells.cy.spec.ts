import { USERS } from "e2e/support/cypress_data";

const { H } = cy;

describe("scenarios > data studio > transforms > upsells", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();

    cy.intercept("GET", "api/ee/billing", (req) => {
      req.continue((res) => {
        if (!res.body["data"]) {
          res.body["data"] = {
            billing_period_months: 1,
            previous_add_ons: [],
          };
        }
      });
    });
  });

  describe("starter plan", () => {
    beforeEach(() => {
      H.activateToken("starter");
    });

    it("should render transforms upsell page", () => {
      cy.log("should render upsell with no CTA when user is not a store admin");
      assertBasicTransformsUpsellPage(false);

      cy.log("should render upsell with CTA when user a store admin");
      mockSessionProperties({ storeUserEmail: USERS.admin.email });
      cy.url().reload();
      assertBasicTransformsUpsellPage(true);
    });
  });

  describe("cloud with basic transforms", () => {
    beforeEach(() => {
      H.activateToken("bleeding-edge");
      mockSessionProperties({ features: { "transforms-python": false } });
      createTestTransform();
    });

    it("should show python upsell when trying to use python transforms", () => {
      cy.log("show modal upsell with no CTA when user is not store admin");
      assertPythonTransformsUpsellModal(false);

      cy.log("show modal upsell with CTA when user is store admin");
      mockSessionProperties({
        features: { "transforms-python": false },
        storeUserEmail: USERS.admin.email,
      });
      cy.url().reload();
      assertPythonTransformsUpsellModal(true, true);
    });
  });

  describe("self-hosted", () => {
    beforeEach(() => {
      H.activateToken("pro-self-hosted");
      enableTransformsFlow();
    });

    it("should show python upsell when trying to use python transforms", () => {
      cy.log("show modal upsell with no CTA when user is not store admin");
      mockSessionProperties({
        storeUserEmail: undefined,
        features: { "transforms-python": false },
      });
      assertPythonTransformsUpsellModal(false);

      cy.log("show modal upsell with CTA when user is store admin");
      mockSessionProperties({
        storeUserEmail: USERS.admin.email,
        features: { "transforms-python": false },
      });
      cy.url().reload();
      assertPythonTransformsUpsellModal(true);
    });
  });
});

function assertBasicTransformsUpsellPage(isStoreUser = true) {
  cy.log("Visit data studio page");
  cy.visit("/data-studio");
  H.DataStudio.nav().should("be.visible");

  cy.log("Verify Transforms menu item is visible");
  H.DataStudio.nav().findByText("Transforms").should("be.visible");

  cy.log(
    "Verify there is an upsell gem icon is displayed in Transforms menu item",
  );
  H.DataStudio.nav()
    .findByText("Transforms")
    .closest("a")
    .within(() => {
      cy.findByTestId("upsell-gem").should("be.visible");
    });

  cy.log("Verify transforms page is accessible");
  H.DataStudio.nav().findByText("Transforms").click();

  cy.findByText("Start transforming your data in Metabase").should(
    "be.visible",
  );

  if (isStoreUser) {
    cy.findByRole("button", { name: "Start trial" }).should("be.visible");
  } else {
    cy.findByText(/Please ask a Metabase Store Admin/).should("be.visible");
    cy.findByRole("button", { name: "Confirm purchase" }).should("not.exist");
    cy.findByRole("button", { name: "Add to trial" }).should("not.exist");
  }
}

function assertPythonTransformsUpsellModal(
  isStoreUser = true,
  isCloud = false,
) {
  cy.log("Visit data studio page");
  cy.visit("/data-studio");
  H.DataStudio.nav().should("be.visible");

  cy.log("Verify Transforms menu item is visible");
  H.DataStudio.nav().findByText("Transforms").should("be.visible");

  cy.log("Verify there is an upsell gem icon is not displayed");
  H.DataStudio.nav()
    .findByText("Transforms")
    .closest("a")
    .within(() => {
      cy.findByTestId("upsell-gem").should("not.exist");
    });

  H.DataStudio.nav().findByText("Transforms").click();
  cy.findByRole("gridcell", { name: /Python library/ }).click();

  cy.findByText("Go beyond SQL with advanced transforms").should("be.visible");

  if (isStoreUser) {
    if (isCloud) {
      cy.findByRole("button", {
        name: "Confirm purchase",
      }).should("be.visible");
    } else {
      cy.findByRole("link", {
        name: "Go to your store account to purchase",
      }).should("be.visible");
    }
  } else {
    cy.findByText(/Please ask a Metabase Store Admin/).should("be.visible");
    cy.findByRole("link", {
      name: "Go to your store account to purchase",
    }).should("not.exist");
    cy.findByRole("button", {
      name: "Confirm purchase",
    }).should("not.exist");
  }

  cy.log(
    "Verify upsell modal is also shown when clicking the 'Python script' menu",
  );
  cy.realType("{esc}");
  cy.findByText("Go beyond SQL with advanced transforms").should("not.exist");
  cy.findByRole("button", { name: "Create a transform" }).click();
  H.popover()
    .findByText(/Python script/)
    .click();

  cy.findByText("Go beyond SQL with advanced transforms").should("be.visible");
}

function mockSessionProperties({
  features = {},
  storeUserEmail,
}: {
  features?: Record<string, boolean>;
  storeUserEmail?: string;
}) {
  cy.intercept("GET", "api/session/properties", (req) => {
    req.continue((res) => {
      if (storeUserEmail) {
        res.body["token-status"] = {
          ...res.body["token-status"],
          "store-users": [
            ...res.body["token-status"]["store-users"],
            {
              id: 9999,
              email: storeUserEmail,
              "first-name": "Admin",
            },
          ],
        };
      }

      res.body["token-features"] = {
        ...res.body["token-features"],
        ...features,
      };
    });
  });
}

function enableTransformsFlow() {
  cy.visit("/data-studio");
  H.DataStudio.nav().findByText("Transforms").click();
  H.DataStudio.Transforms.enableTransformPage()
    .should("be.visible")
    .findByRole("button", { name: "Enable transforms" })
    .click();
  H.DataStudio.Transforms.list().should("be.visible");
  createTestTransform();
  cy.url().reload();
}

function createTestTransform() {
  H.createSqlTransform({
    sourceQuery: "SELECT 1",
    targetTable: "table_a",
    targetSchema: "Schema A",
  });
}
