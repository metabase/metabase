const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
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

const targetQuestion = {
  display: "scalar",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
};

const stringLabelSource = {
  name: "String label source",
  native: {
    query:
      "SELECT DISTINCT CATEGORY, CONCAT(CATEGORY, ' Label') AS LABEL " +
      "FROM PRODUCTS WHERE CATEGORY != 'Doohickey'",
  },
};

const numberLabelSource = {
  name: "Number label source",
  native: {
    query: "SELECT ID, TITLE FROM PRODUCTS ORDER BY ID ASC LIMIT 5",
  },
};

describe("scenarios > dashboard > filters", { tags: "@slow" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("question, static list and field sources", () => {
    it("should be able to use structured, native and labeled question sources, static list sources and field search", () => {
      H.createQuestion(structuredSourceQuestion, {
        wrapId: true,
        idAlias: "structuredSourceQuestionId",
      });
      H.createNativeQuestion(nativeSourceQuestion, {
        wrapId: true,
        idAlias: "nativeSourceQuestionId",
      });
      H.createNativeQuestion(stringLabelSource);
      H.createNativeQuestion(numberLabelSource);
      H.createQuestionAndDashboard({
        questionDetails: targetQuestion,
      }).then(({ body: { dashboard_id } }) => {
        H.visitDashboard(dashboard_id);
      });

      H.editDashboard();

      H.setFilter("Text or Category", "Contains", "GUI Contains");
      mapFilterToQuestion();
      H.setDropdownFilterType();
      H.setFilterQuestionSource({ question: "GUI source", field: "Category" });

      H.setFilter("Text or Category", "Is", "GUI Is");
      mapFilterToQuestion();
      H.setFilterQuestionSource({ question: "GUI source", field: "Category" });

      H.setFilter("Text or Category", "Is", "SQL Is");
      mapFilterToQuestion();
      H.setFilterQuestionSource({ question: "SQL source", field: "CATEGORY" });

      H.setFilter("Text or Category", "Is", "String label");
      mapFilterToQuestion();
      H.setFilterQuestionSource({
        question: "String label source",
        field: "CATEGORY",
        labelField: "LABEL",
      });

      H.setFilter("Number", "Equal to", "Number label");
      mapFilterToQuestion("Rating");
      H.setFilterQuestionSource({
        question: "Number label source",
        field: "ID",
        labelField: "TITLE",
      });

      H.setFilter("ID", undefined, "ID label");
      mapFilterToQuestion("ID");
      H.setFilterQuestionSource({
        question: "Number label source",
        field: "ID",
        labelField: "TITLE",
      });

      H.setFilter("Text or Category", "Is", "List dropdown");
      mapFilterToQuestion();
      H.setFilterListSource({
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });

      H.setFilter("Text or Category", "Is", "List search");
      mapFilterToQuestion();
      H.sidebar().findByText("Search box").click();
      H.setFilterListSource({
        values: [["Gadget"], ["Gizmo", "Gizmo Label"], "Widget"],
      });

      H.setFilter("Text or Category", "Is", "Field search");
      mapFilterToQuestion();
      H.setSearchBoxFilterType();

      H.saveDashboard();

      cy.log("structured question source with string/contains parameter");
      H.getDashboardCard().findByText("200").should("be.visible");
      H.filterWidget({ name: "GUI Contains" }).click();
      H.popover().findByText("Gizmo").click();
      H.popover().button("Add filter").click();
      H.getDashboardCard().findByText("51").should("be.visible");

      cy.log("structured question source with string/= parameter");
      filterDashboard({ name: "GUI Is" });

      cy.log("native question source");
      filterDashboard({ name: "SQL Is" });

      cy.log(
        "string/string: the dropdown shows the labels instead of the raw values",
      );
      H.filterWidget({ name: "String label" }).click();
      H.popover().within(() => {
        cy.findByText("Gadget Label").should("be.visible");
        cy.findByText("Gizmo Label").should("be.visible");
        cy.findByText("Gizmo").should("not.exist");
        cy.findByText("Gizmo Label").click();
        cy.button("Add filter").click();
      });

      cy.log(
        "string/string: the selected value is shown remapped to its label",
      );
      H.filterWidget({ name: "String label" })
        .findByText("Gizmo Label")
        .should("be.visible");

      cy.log(
        "number/string: the dropdown shows the product titles instead of the numeric ids",
      );
      H.filterWidget({ name: "Number label" }).click();
      H.popover().within(() => {
        cy.findByText("Rustic Paper Wallet").should("be.visible");
        cy.findByText("1").should("not.exist");
        cy.findByText("Rustic Paper Wallet").click();
        cy.button("Add filter").click();
      });

      cy.log(
        "number/string: the selected value is shown remapped to its label",
      );
      H.filterWidget({ name: "Number label" })
        .findByText("Rustic Paper Wallet")
        .should("be.visible");

      cy.log(
        "id/string: the dropdown shows the product titles instead of the numeric ids",
      );
      H.filterWidget({ name: "ID label" }).click();
      H.popover().within(() => {
        cy.findByText("Rustic Paper Wallet").should("be.visible");
        cy.findByText("Rustic Paper Wallet").click();
        cy.button("Add filter").click();
      });

      cy.log("id/string: the selected value and the remapped label are shown");
      H.filterWidget({ name: "ID label" })
        .findByText("- 1")
        .should("be.visible");
      H.filterWidget({ name: "ID label" })
        .findByText("Rustic Paper Wallet")
        .should("be.visible");

      cy.log("static list source (dropdown)");
      filterDashboard({ name: "List dropdown", isLabeled: true });
      H.filterWidget({ name: "List dropdown" })
        .findByText("Gizmo Label")
        .should("be.visible");

      cy.log("static list source (search)");
      setSearchFilter({ name: "List search", label: "Gizmo Label" });

      cy.log("field source (search box)");
      filterDashboard({ name: "Field search", isField: true });

      cy.log("archive question sources");
      cy.get("@structuredSourceQuestionId").then(H.visitQuestion);
      archiveQuestion(
        "It will also be removed from the 2 filters that use it to populate values.",
      );

      cy.get("@nativeSourceQuestionId").then(H.visitQuestion);
      archiveQuestion(
        "It will also be removed from the filter that uses it to populate values.",
      );
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

    it("should be possible to use custom labels on IP address columns and type/Quantity fields", () => {
      H.editDashboard();

      H.setFilter("Text or Category", "Is", "IP address");
      mapFilterToQuestion("Inet");
      H.setFilterListSource({
        values: [
          ["192.168.0.1/24", "Router"],
          ["127.0.0.1", "Localhost"],
          "0.0.0.1/0",
        ],
      });

      H.setFilter("Text or Category", "Is", "Quantity");
      mapFilterToQuestion("Count");
      H.setFilterListSource({
        values: [["10", "Ten"], ["20", "Twenty"], "30"],
      });

      H.saveDashboard();

      cy.log("IP address column");
      openFilter("IP address");
      H.popover().within(() => {
        cy.findByText("Router").should("be.visible");
        cy.findByText("Localhost").should("be.visible");
        cy.findByText("0.0.0.1/0").should("be.visible");

        cy.findByText("Router").click();
        cy.button("Add filter").click();
      });

      H.filterWidget({ name: "IP address" }).should("contain", "Router");

      cy.log("type/Quantity field");
      openFilter("Quantity");
      H.popover().within(() => {
        cy.findByText("Ten").should("be.visible");
        cy.findByText("Twenty").should("be.visible");
        cy.findByText("30").should("be.visible");

        cy.findByText("Twenty").click();
        cy.button("Add filter").click();
      });

      H.filterWidget({ name: "Quantity" }).should("contain", "Twenty");
    });
  },
);

const mapFilterToQuestion = (column = "Category") => {
  cy.findByText("Select…").click();
  H.popover().within(() => cy.findByText(column).click());
};

const filterDashboard = ({ name, isField = false, isLabeled = false }) => {
  openFilter(name);

  H.popover().within(() => {
    const GIZMO = isLabeled ? "Gizmo Label" : "Gizmo";

    cy.findByText(GIZMO).should("be.visible");
    cy.findByText("Doohickey").should(isField ? "be.visible" : "not.exist");
    cy.findByText("Gadget").should("be.visible");
    cy.findByText("Widget").should("be.visible");

    cy.findByPlaceholderText("Search the list").type("i");
    cy.findByText("Gadget").should("not.exist");
    cy.findByText("Widget").should("be.visible");
    cy.findByText("Doohickey").should(isField ? "be.visible" : "not.exist");

    cy.findByText(GIZMO).click();
    cy.button("Add filter").click();
  });
};

function openFilter(name) {
  H.filterWidget({ name }).click();
}

const archiveQuestion = (filterWarning) => {
  H.openQuestionActions();
  cy.findByTestId("archive-button").click();
  cy.findByText(
    `This question will be removed from any dashboards or alerts using it. ${filterWarning}`,
  );
};

function setSearchFilter({ name, label }) {
  H.filterWidget({ name }).click();
  H.popover().within(() => {
    H.fieldValuesCombobox().type(label);
  });

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.popover().last().findByText(label).click();
  H.popover().within(() => {
    H.fieldValuesValue(0).should("be.visible").should("contain", label);
    cy.button("Add filter").click();
  });

  H.filterWidget({ name }).findByText(label).should("be.visible");
}
