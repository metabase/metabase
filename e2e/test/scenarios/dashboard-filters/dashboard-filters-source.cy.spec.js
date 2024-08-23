import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertDatasetReqIsSandboxed,
  describeEE,
  editDashboard,
  filterWidget,
  getDashboardCard,
  getTable,
  multiAutocompleteInput,
  multiAutocompleteValue,
  openQuestionActions,
  popover,
  resetTestTable,
  restore,
  resyncDatabase,
  saveDashboard,
  setDropdownFilterType,
  setFilter,
  setFilterListSource,
  setFilterQuestionSource,
  setSearchBoxFilterType,
  setTokenFeatures,
  sidebar,
  visitDashboard,
  visitEmbeddedPage,
  visitPublicDashboard,
  visitQuestion,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const structuredSourceQuestion = {
  name: "GUI source",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
    filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
  },
};

const nativeSourceQuestion = {
  name: "SQL source",
  native: {
    query: "select CATEGORY from PRODUCTS WHERE CATEGORY != 'Doohickey'",
  },
};

const targetParameter = {
  id: "f8ec7c71",
  type: "string/=",
  name: "Text",
  slug: "text",
  sectionId: "string",
};

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

describe("scenarios > dashboard > filters", { tags: "@slow" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("structured question source", () => {
    it("should be able to use a structured question source", () => {
      cy.createQuestion(structuredSourceQuestion, { wrapId: true });
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      setFilterQuestionSource({ question: "GUI source", field: "Category" });
      saveDashboard();
      filterDashboard();

      cy.get("@questionId").then(visitQuestion);
      archiveQuestion();
    });

    it("should be able to use a structured question source when embedded", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getStructuredDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
            visitEmbeddedPage(getDashboardResource(card));
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a structured question source when public", () => {
      cy.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getStructuredDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
            visitPublicDashboard(card.dashboard_id);
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a structured question source with string/contains parameter", () => {
      cy.createQuestion(structuredSourceQuestion, { wrapId: true });
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Contains");
      mapFilterToQuestion();
      setDropdownFilterType();
      setFilterQuestionSource({ question: "GUI source", field: "Category" });
      saveDashboard();
      getDashboardCard().findByText("200").should("be.visible");
      filterWidget().click();
      popover().findByText("Gizmo").click();
      popover().button("Add filter").click();
      getDashboardCard().findByText("51").should("be.visible");
    });
  });

  describe("native question source", () => {
    it("should be able to use a native question source", () => {
      cy.createNativeQuestion(nativeSourceQuestion, { wrapId: true });
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      setFilterQuestionSource({ question: "SQL source", field: "CATEGORY" });
      saveDashboard();
      filterDashboard();

      cy.get("@questionId").then(visitQuestion);
      archiveQuestion();
    });

    it("should be able to use a native question source when embedded", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getNativeDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
            visitEmbeddedPage(getDashboardResource(card));
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a native question source when public", () => {
      cy.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          cy.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getNativeDashboard(questionId),
          }).then(({ body: card }) => {
            cy.editDashboardCard(card, getParameterMapping(card));
            visitPublicDashboard(card.dashboard_id);
          });
        },
      );

      filterDashboard();
    });
  });

  describe("static list source (dropdown)", () => {
    it("should be able to use a static list source", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      setFilterListSource({
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });
      saveDashboard();
      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Gizmo Label").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Gizmo Label").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isLabeled: true });
      filterWidget().findByText("Gizmo Label").should("be.visible");
    });
  });

  describe("static list source (search)", () => {
    it("should be able to use a static list source (search)", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      sidebar().findByText("Search box").click();
      setFilterListSource({
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });
      saveDashboard();

      setSearchFilter("Gizmo Label");
    });

    it("should be able to use a static list source when embedded", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitEmbeddedPage(getDashboardResource(card));
      });

      setSearchFilter("Gizmo Label");
      filterWidget().findByText("Gizmo Label").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        cy.editDashboardCard(card, getParameterMapping(card));
        visitPublicDashboard(card.dashboard_id);
      });

      setSearchFilter("Gizmo Label");
    });
  });

  describe("field source", () => {
    it("should be able to use search box with fields configured for list", () => {
      cy.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id);
      });

      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      setSearchBoxFilterType();
      saveDashboard();
      filterDashboard({ isField: true });
    });
  });
});

describe(
  "scenarios > dashboard > filters > exotic types",
  { tags: ["@external"] },
  () => {
    const TABLE_NAME = "ip_addresses";

    beforeEach(() => {
      resetTestTable({ type: "postgres", table: TABLE_NAME });
      restore("postgres-writable");
      cy.signInAsAdmin();
      resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: TABLE_NAME,
      });

      getTable({ databaseId: WRITABLE_DB_ID, name: TABLE_NAME }).then(table => {
        const countField = table.fields.find(field => field.name === "count");
        cy.request("PUT", `/api/field/${countField.id}`, {
          semantic_type: "type/Quantity",
        });

        cy.createQuestionAndDashboard({
          questionDetails: {
            database: WRITABLE_DB_ID,
            query: {
              "source-table": table.id,
            },
          },
        }).then(({ body: { dashboard_id } }) => {
          visitDashboard(dashboard_id);
        });
      });
    });

    it("should be possible to use custom labels on IP address columns", () => {
      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion("Inet");
      setFilterListSource({
        values: [
          ["192.168.0.1/24", "Router"],
          ["127.0.0.1", "Localhost"],
          "0.0.0.1/0",
        ],
      });
      saveDashboard();

      openFilter();
      popover().within(() => {
        cy.findByText("Router").should("be.visible");
        cy.findByText("Localhost").should("be.visible");
        cy.findByText("0.0.0.1/0").should("be.visible");

        cy.findByText("Router").click();
        cy.button("Add filter").click();
      });

      cy.findByTestId("fixed-width-filters").should("contain", "Router");
    });

    it("should be possible to use custom labels on type/Quantity fields", () => {
      editDashboard();
      setFilter("Text or Category", "Is");
      mapFilterToQuestion("Count");
      setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      saveDashboard();

      openFilter();
      popover().within(() => {
        cy.findByText("Ten").should("be.visible");
        cy.findByText("Twenty").should("be.visible");
        cy.findByText("30").should("be.visible");

        cy.findByText("Twenty").click();
        cy.button("Add filter").click();
      });

      cy.findByTestId("fixed-width-filters").should("contain", "Twenty");
    });
  },
);

describeEE("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    restore("default-ee");
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should sandbox parameter values in dashboards", () => {
    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", PRODUCTS.ID, null]],
      },
    });

    cy.createQuestion(structuredSourceQuestion).then(
      ({ body: { id: questionId } }) => {
        cy.createQuestionAndDashboard({
          questionDetails: targetQuestion,
          dashboardDetails: getStructuredDashboard(questionId),
        }).then(({ body: card }) => {
          cy.editDashboardCard(card, getParameterMapping(card));
          cy.signOut();
          cy.signInAsSandboxedUser();
          visitDashboard(card.dashboard_id);
          assertDatasetReqIsSandboxed({
            requestAlias: `@dashcardQuery${card.id}`,
          });
        });
      },
    );

    filterDashboard({ isSandboxed: true });
  });
});

const mapFilterToQuestion = (column = "Category") => {
  cy.findByText("Select…").click();
  popover().within(() => cy.findByText(column).click());
};

const filterDashboard = ({
  isField = false,
  isSandboxed = false,
  isLabeled = false,
} = {}) => {
  cy.findByText("Text").click();

  popover().within(() => {
    const GIZMO = isLabeled ? "Gizmo Label" : "Gizmo";

    cy.findByText(GIZMO).should("be.visible");
    cy.findByText("Doohickey").should(isField ? "be.visible" : "not.exist");
    cy.findByText("Gadget").should(isSandboxed ? "not.exist" : "be.visible");
    cy.findByText("Widget").should(isSandboxed ? "not.exist" : "be.visible");

    cy.findByPlaceholderText("Search the list").type("i");
    cy.findByText("Gadget").should("not.exist");
    cy.findByText("Widget").should(isSandboxed ? "not.exist" : "be.visible");
    cy.findByText("Doohickey").should(isField ? "be.visible" : "not.exist");

    cy.findByText(GIZMO).click();
    cy.button("Add filter").click();
  });
};

function openFilter() {
  cy.findByText("Text").click();
}

const archiveQuestion = () => {
  openQuestionActions();
  cy.findByTestId("archive-button").click();
  cy.findByText(
    "This question will be removed from any dashboards or alerts using it. It will also be removed from the filter that uses it to populate values.",
  );
};

const getDashboardResource = ({ dashboard_id }) => ({
  resource: { dashboard: dashboard_id },
  params: {},
});

const getTargetDashboard = sourceSettings => ({
  parameters: [
    {
      ...targetParameter,
      ...sourceSettings,
    },
  ],
  enable_embedding: true,
  embedding_params: {
    [targetParameter.slug]: "enabled",
  },
});

const getStructuredDashboard = questionId => {
  return getTargetDashboard({
    values_source_type: "card",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", PRODUCTS.CATEGORY, null],
    },
  });
};

const getNativeDashboard = questionId => {
  return getTargetDashboard({
    values_source_type: "card",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", "CATEGORY", { "base-type": "type/Text" }],
    },
  });
};

const getListDashboard = values_query_type => {
  return getTargetDashboard({
    values_source_type: "static-list",
    values_query_type,
    values_source_config: {
      values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
    },
  });
};

const getParameterMapping = ({ card_id }) => ({
  parameter_mappings: [
    {
      card_id,
      parameter_id: targetParameter.id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    },
  ],
});

function setSearchFilter(label) {
  filterWidget().click();
  popover().within(() => {
    multiAutocompleteInput().type(label);
  });

  popover().last().findByText(label).click();
  popover().within(() => {
    multiAutocompleteValue(0).should("be.visible").should("contain", label);
    cy.button("Add filter").click();
  });

  filterWidget().findByText(label).should("be.visible");
}
