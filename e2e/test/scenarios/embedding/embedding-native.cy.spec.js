import {
  restore,
  popover,
  filterWidget,
  clearFilterWidget,
  visitEmbeddedPage,
  visitIframe,
  openStaticEmbeddingModal,
  closeStaticEmbeddingModal,
  publishChanges,
  setEmbeddingParameter,
  assertEmbeddingParameter,
} from "e2e/support/helpers";

import * as SQLFilter from "../native-filters/helpers/e2e-sql-filter-helpers";

import { questionDetailsWithDefaults } from "./shared/embedding-dashboard";
import { questionDetails } from "./shared/embedding-native";

describe("scenarios > embedding > native questions", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  context("UI", () => {
    function createAndVisitQuestion({ requiredTagName, defaultValue } = {}) {
      const details = structuredClone(questionDetails);

      if (requiredTagName) {
        details.native["template-tags"][requiredTagName].default = defaultValue;
        details.native["template-tags"][requiredTagName].required = true;
      }

      cy.createNativeQuestion(details, {
        wrapId: true,
        visitQuestion: true,
      });

      openStaticEmbeddingModal({ activeTab: "parameters" });
    }

    it("should not display disabled parameters", () => {
      createAndVisitQuestion();

      publishChanges("card", ({ request }) => {
        assert.deepEqual(request.body.embedding_params, {});
      });

      visitIframe();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Lora Cronin");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Organic");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("39.58");

      filterWidget().should("not.exist");
    });

    it("should display and work with enabled parameters while hiding the locked one", () => {
      createAndVisitQuestion();

      setEmbeddingParameter("Order ID", "Editable");
      setEmbeddingParameter("Created At", "Editable");
      setEmbeddingParameter("Total", "Locked");
      setEmbeddingParameter("State", "Editable");
      setEmbeddingParameter("Product ID", "Editable");

      publishChanges("card", ({ request }) => {
        const actual = request.body.embedding_params;

        const expected = {
          id: "enabled",
          created_at: "enabled",
          total: "locked",
          state: "enabled",
          product_id: "enabled",
        };

        assert.deepEqual(actual, expected);
      });

      cy.get("@questionId").then(questionId => {
        const payload = {
          resource: { question: questionId },
          params: { total: [] },
        };

        visitEmbeddedPage(payload);
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Organic");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Twitter").should("not.exist");

      // Created At: Q2 2023
      filterWidget().contains("Created At").click();
      cy.findByTestId("select-button").click();
      popover().last().contains("2023").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Q2").click();

      // State: is not KS
      filterWidget().contains("State").click();
      cy.findByPlaceholderText("Search the list").type("KS{enter}");
      cy.findAllByTestId(/-filter-value$/).should("have.length", 1);
      cy.findByTestId("KS-filter-value").should("be.visible").click();
      cy.button("Add filter").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Logan Weber").should("not.exist");

      // Product ID is 10
      cy.findByPlaceholderText("Product ID").type("10{enter}");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Affiliate").should("not.exist");

      // Let's try to remove one filter
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Q2 2023")
        .closest("fieldset")
        .within(() => {
          cy.icon("close").click();
        });

      // Order ID is 926 - there should be only one result after this
      filterWidget().contains("Order ID").click();
      cy.findByPlaceholderText("Enter an ID").type("926");
      cy.button("Add filter").click();

      cy.findByTestId("table-row").should("have.length", 1);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("December 29, 2024, 4:54 AM");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("CO");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sid Mills").should("not.exist");

      cy.location("search").should(
        "eq",
        "?id=926&created_at=&state=KS&product_id=10",
      );
    });

    it("should handle required parameters", () => {
      createAndVisitQuestion({ requiredTagName: "total", defaultValue: [100] });

      assertEmbeddingParameter("Total", "Editable");

      publishChanges("card", ({ request }) => {
        const actual = request.body.embedding_params;

        // We only expect total to be "enabled" because the rest
        // weren't touched and therefore aren't changed, whereas
        // "enabled" must be set by default for required params.
        const expected = {
          total: "enabled",
        };

        assert.deepEqual(actual, expected);
      });

      visitIframe();

      // Filter widget must be visible
      filterWidget().contains("Total");

      // And its default value must be in the URL
      cy.location("search").should("eq", "?total=100");
    });

    it("should (dis)allow setting parameters as required for a published embedding", () => {
      createAndVisitQuestion();
      // Make one parameter editable and one locked
      setEmbeddingParameter("Order ID", "Editable");
      setEmbeddingParameter("Total", "Locked");

      publishChanges("card");
      closeStaticEmbeddingModal();

      cy.findByTestId("native-query-editor-container")
        .findByText("Open Editor")
        .click();

      // Open variable editor
      cy.findByTestId("native-query-editor-sidebar").icon("variable").click();

      // Now check that all disabled parameters can't be required and the rest can
      assertRequiredEnabledForName({ name: "id", enabled: true });
      assertRequiredEnabledForName({ name: "total", enabled: true });
      // disabled parameters
      assertRequiredEnabledForName({ name: "created_at", enabled: false });
      assertRequiredEnabledForName({ name: "source", enabled: false });
      assertRequiredEnabledForName({ name: "state", enabled: false });
      assertRequiredEnabledForName({ name: "product_id", enabled: false });
    });
  });

  context("API", () => {
    beforeEach(() => {
      cy.createNativeQuestion(questionDetails, {
        wrapId: true,
      });
    });

    it("should hide filters via url", () => {
      cy.get("@questionId").then(questionId => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            id: "enabled",
            product_id: "enabled",
            state: "enabled",
            created_at: "enabled",
            total: "enabled",
          },
        });

        const payload = {
          resource: { question: questionId },
          params: {},
        };

        // It should be possible to both set the filter value and hide it at the same time.
        // That's the synonymous to the locked filter.
        visitEmbeddedPage(payload, {
          setFilters: { id: 92 },
          hideFilters: ["id", "product_id", "state", "created_at", "total"],
        });

        cy.findByTestId("table-row").should("have.length", 1);
        cy.findByText("92");

        filterWidget().should("not.exist");
      });
    });

    it("should set multiple filter values via url", () => {
      cy.get("@questionId").then(questionId => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            created_at: "enabled",
            source: "enabled",
            state: "enabled",
            total: "enabled",
          },
        });

        const payload = {
          resource: { question: questionId },
          params: {},
        };

        visitEmbeddedPage(payload, {
          setFilters: { created_at: "Q2-2025", source: "Organic", state: "OR" },
        });

        filterWidget()
          .should("have.length", 4)
          .and("contain", "OR")
          .and("contain", "Q2 2025");
        // Why do we use input field in one filter widget but a simple `span` in the other one?
        cy.findByDisplayValue("Organic");

        // Total's value should fall back to the default one (`0`) because we didn't set it explicitly
        cy.get("legend").contains("Total").parent("fieldset").contains("0");

        cy.contains("Emilie Goyette");
        cy.contains("35.7");

        // OTOH, we should also be able to override the default filter value by eplixitly setting it
        visitEmbeddedPage(payload, {
          setFilters: { total: 80 },
        });

        cy.get("legend").contains("Total").parent("fieldset").contains("80");

        cy.contains("35.7").should("not.exist");
      });
    });

    it("should lock all parameters", () => {
      cy.get("@questionId").then(questionId => {
        cy.request("PUT", `/api/card/${questionId}`, {
          enable_embedding: true,
          embedding_params: {
            id: "locked",
            product_id: "locked",
            state: "locked",
            created_at: "locked",
            total: "locked",
            source: "locked",
          },
        });

        const payload = {
          resource: { question: questionId },
          params: {
            id: [92, 96, 102, 104],
            product_id: [140],
            state: ["AK", "TX"],
            created_at: "Q3-2024",
            total: [10],
            source: ["Organic"],
          },
        };

        visitEmbeddedPage(payload);

        cy.findByTestId("table-row").should("have.length", 1);
        cy.findByText("66.8");

        filterWidget().should("not.exist");
      });
    });
  });
});

describe("scenarios > embedding > native questions with default parameters", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetailsWithDefaults, {
      visitQuestion: true,
      wrapId: true,
    });

    openStaticEmbeddingModal({ activeTab: "parameters" });

    // Note: ID is disabled
    setEmbeddingParameter("Source", "Locked");
    setEmbeddingParameter("Name", "Editable");
    publishChanges("card", ({ request }) => {
      assert.deepEqual(request.body.embedding_params, {
        source: "locked",
        name: "enabled",
      });
    });
  });

  it("card parameter defaults should apply for disabled parameters, but not for editable or locked parameters", () => {
    cy.get("@questionId").then(questionId => {
      const payload = {
        resource: { question: questionId },
        params: { source: [] },
      };

      visitEmbeddedPage(payload);
    });
    // Remove default filter value
    clearFilterWidget();
    // The ID default (1, 2) should apply, because it is disabled.
    // The Name default ('Lina Heaney') should not apply, because the Name param is editable and empty
    // The Source default ('Facebook') should not apply because the param is locked but the value is unset
    // If either the Name or Source default applied the result would be 0.
    cy.findByTestId("scalar-value").invoke("text").should("eq", "2");
  });

  it("locked parameters require a value to be specified in the JWT", () => {
    cy.get("@questionId").then(questionId => {
      const payload = {
        resource: { question: questionId },
        params: { source: null },
      };

      visitEmbeddedPage(payload);
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("You must specify a value for :source in the JWT.").should(
      "be.visible",
    );
  });
});

function assertRequiredEnabledForName({ name, enabled }) {
  cy.findByTestId(`tag-editor-variable-${name}`).within(() => {
    SQLFilter.getRequiredInput().should(
      enabled ? "be.enabled" : "not.be.enabled",
    );
  });
}
