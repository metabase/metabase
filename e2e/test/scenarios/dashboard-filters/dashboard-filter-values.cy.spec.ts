const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  DashboardDetails,
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { CardId, GetFieldValuesResponse } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > values", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("question, static list and field sources", { tags: "@slow" }, () => {
    const structuredSourceQuestion: StructuredQuestionDetails = {
      name: "GUI source",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
        filter: ["!=", ["field", PRODUCTS.CATEGORY, null], "Doohickey"],
      },
    };

    const nativeSourceQuestion: NativeQuestionDetails = {
      name: "SQL source",
      native: {
        query: "select CATEGORY from PRODUCTS WHERE CATEGORY != 'Doohickey'",
      },
    };

    const stringLabelSource: NativeQuestionDetails = {
      name: "String label source",
      native: {
        query:
          "SELECT DISTINCT CATEGORY, CONCAT(CATEGORY, ' Label') AS LABEL " +
          "FROM PRODUCTS WHERE CATEGORY != 'Doohickey'",
      },
    };

    const targetQuestion: StructuredQuestionDetails = {
      display: "scalar",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
      },
    };

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

      H.setFilter("Text or Category", "Is", "List dropdown");
      mapFilterToQuestion();
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

      cy.log("static list source (dropdown)");
      filterDashboard({ name: "List dropdown", isLabeled: true });
      H.filterWidget({ name: "List dropdown" })
        .findByText("Gizmo Label")
        .should("be.visible");

      cy.log("field source (search box)");
      filterDashboard({ name: "Field search", isField: true });

      cy.log("archive question sources");
      cy.get<CardId>("@structuredSourceQuestionId").then((id) =>
        H.visitQuestion(id),
      );
      archiveQuestion(
        "It will also be removed from the 2 filters that use it to populate values.",
      );

      cy.get<CardId>("@nativeSourceQuestionId").then((id) =>
        H.visitQuestion(id),
      );
      archiveQuestion(
        "It will also be removed from the filter that uses it to populate values.",
      );
    });
  });

  describe("chained filters", () => {
    (["search", "list"] as const).forEach((has_field_values) => {
      it(`limit ${has_field_values} options based on linked filter`, () => {
        cy.request("PUT", `/api/field/${PEOPLE.CITY}`, { has_field_values });
        H.visitDashboard(ORDERS_DASHBOARD_ID);

        H.editDashboard();

        // add a state filter
        H.setFilter("Location", "Is", "Location");

        // connect that to people.state
        H.getDashboardCard().within(() => {
          cy.findByText("Column to filter on");
          cy.findByText("Select…").click();
        });

        H.popover().within(() => {
          cy.findByText("State").click();
        });

        // open the linked filters tab, and click the click to add a City filter
        cy.findAllByRole("tab").contains("Linked filters").click();

        cy.findByRole("tabpanel")
          .findByText("add another dashboard filter")
          .click();

        H.popover().findByText("Location").click();

        H.sidebar().findByText("Filter operator").next().click();
        H.selectDropdown().findByText("Is").click();

        // connect that to person.city
        H.getDashboardCard().within(() => {
          cy.findByText("Column to filter on");
          cy.findByText("Select…").click();
        });
        H.popover().within(() => {
          cy.findByText("City").click();
        });

        cy.findAllByRole("tab").contains("Linked filters").click();
        // Link city to state
        cy.findByRole("tabpanel").within(() => {
          // turn on the switch, input has 0 width and height
          cy.findByRole("switch").parent().get("label").click();

          // open up the list of linked columns
          cy.findByText("Location").click();
          // It's hard to assert on the "table.column" pairs.
          // We just assert that the headers are there to know that something appeared.
          cy.findByText("Filtering column");
          cy.findByText("Filtered column");
        });

        H.saveDashboard();

        // now test that it worked!
        // Select Alaska as a state. We should see Anchorage as a option but not Anacoco
        H.filterWidget().contains("Location").click();

        cy.findByPlaceholderText(/search the list/i).should("be.visible");

        H.popover().within(() => {
          cy.findByText("AK").click();
          cy.findByText("Add filter").click();
        });

        H.filterWidget().contains("Location 1").click();

        H.dashboardParametersPopover().within(() => {
          if (has_field_values === "search") {
            H.fieldValuesCombobox().type("An");
          }
          if (has_field_values === "list") {
            cy.findByPlaceholderText("Search the list").type("An");
          }
        });

        const valuesWidget = () =>
          has_field_values === "search"
            ? H.selectDropdown()
            : cy.findByTestId("field-values-widget");

        valuesWidget().within(() => {
          cy.findByText("Anchorage").should("exist");
          cy.findByText("Anacoco").should("not.exist");
        });

        cy.findByTestId("parameter-value-dropdown").within(() => {
          if (has_field_values === "search") {
            H.fieldValuesCombobox()
              .type("{backspace}{backspace}")
              // close the suggestion list
              .blur();
          }
          if (has_field_values === "list") {
            cy.findByPlaceholderText("Search the list").clear();
          }
        });

        H.filterWidget().contains("AK").click();

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.popover()
          .last()
          .within(() => {
            cy.findByText("AK").click();
            cy.findByText("GA").click();

            cy.findByText("Update filter").click();
          });

        // do it again to make sure it isn't cached incorrectly
        H.filterWidget().contains("Location 1").click();
        cy.findByTestId("parameter-value-dropdown").within(() => {
          if (has_field_values === "search") {
            H.fieldValuesCombobox().type("An");
          }
          if (has_field_values === "list") {
            cy.findByPlaceholderText("Search the list").type("An");
          }
        });

        valuesWidget().within(() => {
          cy.findByText("Canton");
          cy.findByText("Anchorage").should("not.exist");
        });

        if (has_field_values === "search") {
          cy.findByTestId("parameter-value-dropdown").within(() => {
            // close the suggestion list
            H.fieldValuesCombobox().blur();
          });
        }

        H.filterWidget().contains("GA").click();
        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        H.popover()
          .last()
          .within(() => {
            cy.findByText("GA").click();
            cy.findByText("Update filter").click();
          });

        // do it again without a state filter to make sure it isn't cached incorrectly
        H.filterWidget().contains("Location 1").click();
        cy.findByTestId("parameter-value-dropdown").within(() => {
          if (has_field_values === "search") {
            H.fieldValuesCombobox().type("An");
          }
          if (has_field_values === "list") {
            cy.findByRole("combobox").type("An");
          }
        });

        valuesWidget().within(() => {
          cy.findByText("Adrian");
          cy.findByText("Anchorage");
          cy.findByText("Canton");
        });
      });
    });
  });

  describe("remapping", () => {
    beforeEach(() => {
      addInternalRemapping();
      addExternalRemapping();
    });

    it("should remap dashboard parameter values", () => {
      createRemappingDashboard().then((dashboardId) => {
        H.visitDashboard(dashboardId);
        H.editDashboard();
        mapRemappingParameters();
        H.saveDashboard();

        testDefaultValuesRemapping();
        testWidgetsRemapping();

        H.visitPublicDashboard(dashboardId);
        testDefaultValuesRemapping();
        testWidgetsRemapping();

        H.visitEmbeddedPage({
          resource: { dashboard: dashboardId },
          params: {},
        });
        testDefaultValuesRemapping();
        testWidgetsRemapping();
      });
    });
  });
});

function mapFilterToQuestion(column = "Category") {
  cy.findByText("Select…").click();
  H.popover().within(() => cy.findByText(column).click());
}

function openFilter(name: string) {
  H.filterWidget({ name }).click();
}

function filterDashboard({
  name,
  isField = false,
  isLabeled = false,
}: {
  name: string;
  isField?: boolean;
  isLabeled?: boolean;
}) {
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
}

function archiveQuestion(filterWarning: string) {
  H.openQuestionActions();
  cy.findByTestId("archive-button").click();
  cy.findByText(
    `This question will be removed from any dashboards or alerts using it. ${filterWarning}`,
  );
}

function addInternalRemapping() {
  cy.request("POST", `/api/field/${ORDERS.QUANTITY}/dimension`, {
    name: "Quantity",
    type: "internal",
    human_readable_field_id: null,
  });

  cy.request("GET", `/api/field/${ORDERS.QUANTITY}/values`).then(
    ({ body }: { body: GetFieldValuesResponse }) => {
      cy.request("POST", `/api/field/${ORDERS.QUANTITY}/values`, {
        values: body.values.map(([value]) => [value, `N${value}`]),
      });
    },
  );
}

function addExternalRemapping() {
  cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
    name: "Product ID",
    type: "external",
    human_readable_field_id: PRODUCTS.TITLE,
  });
}

function findWidget(name: string) {
  return H.dashboardParametersContainer().findByLabelText(name);
}

function clearWidget(name: string) {
  findWidget(name).icon("close").click();
}

function createRemappingDashboard() {
  const ordersModelDetails: StructuredQuestionDetails = {
    name: "Orders model",
    type: "model",
    query: {
      "source-table": ORDERS_ID,
    },
  };
  const getOrdersQuestionDetails = (
    modelId: CardId,
  ): StructuredQuestionDetails => ({
    name: "Orders question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
  const peopleModelDetails: StructuredQuestionDetails = {
    name: "People model",
    type: "model",
    query: {
      "source-table": PEOPLE_ID,
    },
  };
  const getPeopleQuestionDetails = (
    modelId: CardId,
  ): StructuredQuestionDetails => ({
    name: "People question",
    type: "question",
    query: {
      "source-table": `card__${modelId}`,
    },
  });
  const nativeQuestionDetails: NativeQuestionDetails = {
    name: "Orders native question",
    native: {
      query: "SELECT * FROM ORDERS WHERE {{product_id}}",
      "template-tags": {
        product_id: {
          id: "product_id",
          name: "Product ID",
          "display-name": "Product ID",
          type: "dimension",
          "field-id": ORDERS.PRODUCT_ID,
        },
      },
    },
  };
  const dashboardDetails: DashboardDetails = {
    parameters: [
      createMockParameter({
        id: "p1",
        slug: "p1",
        name: "Internal",
        type: "number/=",
        default: [1],
      }),
      createMockParameter({
        id: "p2",
        slug: "p2",
        name: "FK",
        type: "id",
        default: [2],
      }),
      createMockParameter({
        id: "p3",
        slug: "p3",
        name: "PK->Name",
        type: "id",
        default: [3],
      }),
      createMockParameter({
        id: "p4",
        slug: "p4",
        name: "FK->Name",
        type: "id",
        default: [4],
      }),
      createMockParameter({
        id: "p5",
        slug: "p5",
        name: "PK+FK->Name",
        type: "id",
        default: [5],
      }),
    ],
    enable_embedding: true,
    embedding_params: {
      p1: "enabled",
      p2: "enabled",
      p3: "enabled",
      p4: "enabled",
      p5: "enabled",
    },
  };
  return H.createQuestion(ordersModelDetails).then(({ body: ordersModel }) => {
    return H.createQuestion(peopleModelDetails).then(
      ({ body: peopleModel }) => {
        return H.createDashboardWithQuestions({
          dashboardDetails,
          questions: [
            getOrdersQuestionDetails(ordersModel.id),
            getPeopleQuestionDetails(peopleModel.id),
            nativeQuestionDetails,
          ],
        }).then(({ dashboard }) => {
          return Number(dashboard.id);
        });
      },
    );
  });
}

function mapRemappingParameters() {
  H.editingDashboardParametersContainer().findByText("Internal").click();
  H.selectDashboardFilter(H.getDashboardCard(0), "Quantity");

  H.editingDashboardParametersContainer().findByText("FK").click();
  H.selectDashboardFilter(H.getDashboardCard(2), "Product ID");

  H.editingDashboardParametersContainer().findByText("PK->Name").click();
  H.selectDashboardFilter(H.getDashboardCard(1), "ID");

  H.editingDashboardParametersContainer().findByText("FK->Name").click();
  H.selectDashboardFilter(H.getDashboardCard(0), "User ID");

  H.editingDashboardParametersContainer().findByText("PK+FK->Name").click();
  H.selectDashboardFilter(H.getDashboardCard(0), "User ID");
  H.selectDashboardFilter(H.getDashboardCard(1), "ID");
}

function testDefaultValuesRemapping() {
  findWidget("Internal").should("contain.text", "N1");
  findWidget("FK").should("contain.text", "Small Marble Shoes");
  findWidget("PK->Name").should("contain.text", "Lina Heaney");
  findWidget("FK->Name").should("contain.text", "Arnold Adams");
  findWidget("PK+FK->Name").should("contain.text", "Dominique Leffler");
}

function testWidgetsRemapping() {
  cy.log("internal remapping");
  clearWidget("Internal");
  findWidget("Internal").click();
  H.popover().within(() => {
    cy.findByText("N5").click();
    cy.button("Update filter").click();
  });
  findWidget("Internal").should("contain.text", "N5");

  cy.log("FK remapping");
  clearWidget("FK");
  findWidget("FK").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Rustic Paper Wallet").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("FK").should("contain.text", "Rustic Paper Wallet");

  cy.log("PK->Name remapping");
  clearWidget("PK->Name");
  findWidget("PK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("1,");
    cy.findByText("Hudson Borer").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("PK->Name").should("contain.text", "Hudson Borer");

  cy.log("FK->Name remapping");
  clearWidget("FK->Name");
  findWidget("FK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("6,");
    cy.findByText("Rene Muller").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("FK->Name").should("contain.text", "Rene Muller");

  cy.log("PK+FK->Name remapping");
  clearWidget("PK+FK->Name");
  findWidget("PK+FK->Name").click();
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter an ID").type("7,");
    cy.findByText("Roselyn Bosco").should("exist");
    cy.button("Update filter").click();
  });
  findWidget("PK+FK->Name").should("contain.text", "Roselyn Bosco");
}
