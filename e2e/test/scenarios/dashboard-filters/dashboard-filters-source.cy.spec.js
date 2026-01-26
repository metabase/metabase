const { H } = cy;
import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("structured question source", () => {
    it("should be able to use a structured question source", () => {
      H.createQuestion(structuredSourceQuestion, { wrapId: true });
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      H.setFilterQuestionSource({ question: "GUI source", field: "Category" });
      H.saveDashboard();
      filterDashboard();

      cy.get("@questionId").then(H.visitQuestion);
      archiveQuestion();
    });

    it("should be able to use a structured question source when embedded", () => {
      H.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          H.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getStructuredDashboard(questionId),
          }).then(({ body: card }) => {
            H.editDashboardCard(card, getParameterMapping(card));
            H.visitEmbeddedPage(getDashboardResource(card));
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a structured question source when public", () => {
      H.createQuestion(structuredSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          H.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getStructuredDashboard(questionId),
          }).then(({ body: card }) => {
            H.editDashboardCard(card, getParameterMapping(card));
            H.visitPublicDashboard(card.dashboard_id);
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a structured question source with string/contains parameter", () => {
      H.createQuestion(structuredSourceQuestion, { wrapId: true });
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Contains");
      mapFilterToQuestion();
      H.setDropdownFilterType();
      H.setFilterQuestionSource({ question: "GUI source", field: "Category" });
      H.saveDashboard();
      H.getDashboardCard().findByText("200").should("be.visible");
      H.filterWidget().click();
      H.popover().findByText("Gizmo").click();
      H.popover().button("Add filter").click();
      H.getDashboardCard().findByText("51").should("be.visible");
    });
  });

  describe("native question source", () => {
    it("should be able to use a native question source", () => {
      H.createNativeQuestion(nativeSourceQuestion, { wrapId: true });
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      H.setFilterQuestionSource({ question: "SQL source", field: "CATEGORY" });
      H.saveDashboard();
      filterDashboard();

      cy.get("@questionId").then(H.visitQuestion);
      archiveQuestion();
    });

    it("should be able to use a native question source when embedded", () => {
      H.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          H.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getNativeDashboard(questionId),
          }).then(({ body: card }) => {
            H.editDashboardCard(card, getParameterMapping(card));
            H.visitEmbeddedPage(getDashboardResource(card));
          });
        },
      );

      filterDashboard();
    });

    it("should be able to use a native question source when public", () => {
      H.createNativeQuestion(nativeSourceQuestion).then(
        ({ body: { id: questionId } }) => {
          H.createQuestionAndDashboard({
            questionDetails: targetQuestion,
            dashboardDetails: getNativeDashboard(questionId),
          }).then(({ body: card }) => {
            H.editDashboardCard(card, getParameterMapping(card));
            H.visitPublicDashboard(card.dashboard_id);
          });
        },
      );

      filterDashboard();
    });
  });

  describe("static list source (dropdown)", () => {
    it("should be able to use a static list source", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      H.setFilterListSource({
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });
      H.saveDashboard();
      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Gizmo Label").should("be.visible");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Gizmo Label").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard(),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitPublicDashboard(card.dashboard_id);
      });

      filterDashboard({ isLabeled: true });
      H.filterWidget().findByText("Gizmo Label").should("be.visible");
    });
  });

  describe("static list source (search)", () => {
    it("should be able to use a static list source (search)", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      H.sidebar().findByText("Search box").click();
      H.setFilterListSource({
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });
      H.saveDashboard();

      setSearchFilter("Gizmo Label");
    });

    it("should be able to use a static list source when embedded", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitEmbeddedPage(getDashboardResource(card));
      });

      setSearchFilter("Gizmo Label");
      H.filterWidget().findByText("Gizmo Label").should("be.visible");
    });

    it("should be able to use a static list source when public", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
        dashboardDetails: getListDashboard("search"),
      }).then(({ body: card }) => {
        H.editDashboardCard(card, getParameterMapping(card));
        H.visitPublicDashboard(card.dashboard_id);
      });

      setSearchFilter("Gizmo Label");
    });
  });

  describe("field source", () => {
    it("should be able to use search box with fields configured for list", () => {
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();
      H.setFilter("Text or Category", "Is");
      mapFilterToQuestion();
      H.setSearchBoxFilterType();
      H.saveDashboard();
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
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: TABLE_NAME });
      cy.signInAsAdmin();
      H.resyncDatabase({
        dbId: WRITABLE_DB_ID,
        tableName: TABLE_NAME,
      });

      H.getTable({ databaseId: WRITABLE_DB_ID, name: TABLE_NAME }).then(
        (table) => {
          const countField = table.fields.find(
            (field) => field.name === "count",
          );
          cy.request("PUT", `/api/field/${countField.id}`, {
            semantic_type: "type/Quantity",
          });

          H.createQuestionAndDashboard({
            questionDetails: {
              database: WRITABLE_DB_ID,
              query: {
                "source-table": table.id,
              },
            },
          }).then(({ body: { dashboard_id } }) => {
            H.visitDashboard(dashboard_id);
          });
        },
      );
    });

    it("should be possible to use custom labels on IP address columns", () => {
      H.editDashboard();
      H.setFilter("Text or Category", "Is");
      mapFilterToQuestion("Inet");
      H.setFilterListSource({
        values: [
          ["192.168.0.1/24", "Router"],
          ["127.0.0.1", "Localhost"],
          "0.0.0.1/0",
        ],
      });
      H.saveDashboard();

      openFilter();
      H.popover().within(() => {
        cy.findByText("Router").should("be.visible");
        cy.findByText("Localhost").should("be.visible");
        cy.findByText("0.0.0.1/0").should("be.visible");

        cy.findByText("Router").click();
        cy.button("Add filter").click();
      });

      cy.findByTestId("fixed-width-filters").should("contain", "Router");
    });

    it("should be possible to use custom labels on type/Quantity fields", () => {
      H.editDashboard();
      H.setFilter("Text or Category", "Is");
      mapFilterToQuestion("Count");
      H.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });
      H.saveDashboard();

      openFilter();
      H.popover().within(() => {
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

describe("scenarios > dashboard > filters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.blockUserGroupPermissions(USER_GROUPS.ALL_USERS_GROUP);
  });

  it("should sandbox parameter values in dashboards", () => {
    cy.sandboxTable({
      table_id: PRODUCTS_ID,
      attribute_remappings: {
        attr_uid: ["dimension", ["field", PRODUCTS.ID, null]],
      },
    });

    H.createQuestion(structuredSourceQuestion).then(
      ({ body: { id: questionId } }) => {
        H.createQuestionAndDashboard({
          questionDetails: targetQuestion,
          dashboardDetails: getStructuredDashboard(questionId),
        }).then(({ body: card }) => {
          H.editDashboardCard(card, getParameterMapping(card));
          cy.signOut();
          cy.signInAsSandboxedUser();
          H.visitDashboard(card.dashboard_id);
          H.assertDatasetReqIsSandboxed({
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
  H.popover().within(() => cy.findByText(column).click());
};

const filterDashboard = ({
  isField = false,
  isSandboxed = false,
  isLabeled = false,
} = {}) => {
  cy.findByText("Text").click();

  H.popover().within(() => {
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
  H.openQuestionActions();
  cy.findByTestId("archive-button").click();
  cy.findByText(
    "This question will be removed from any dashboards or alerts using it. It will also be removed from the filter that uses it to populate values.",
  );
};

const getDashboardResource = ({ dashboard_id }) => ({
  resource: { dashboard: dashboard_id },
  params: {},
});

const getTargetDashboard = (sourceSettings) => ({
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

const getStructuredDashboard = (questionId) => {
  return getTargetDashboard({
    values_source_type: "card",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", PRODUCTS.CATEGORY, null],
    },
  });
};

const getNativeDashboard = (questionId) => {
  return getTargetDashboard({
    values_source_type: "card",
    values_source_config: {
      card_id: questionId,
      value_field: ["field", "CATEGORY", { "base-type": "type/Text" }],
    },
  });
};

const getListDashboard = (values_query_type) => {
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
  H.filterWidget().click();
  H.popover().within(() => {
    H.fieldValuesCombobox().type(label);
  });

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.popover().last().findByText(label).click();
  H.popover().within(() => {
    H.fieldValuesValue(0).should("be.visible").should("contain", label);
    cy.button("Add filter").click();
  });

  H.filterWidget().findByText(label).should("be.visible");
}
