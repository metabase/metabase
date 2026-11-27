const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { LocalFieldReference, Parameter } from "metabase-types/api";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_CREATED_AT_FIELD: LocalFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const PARAMETER_A = {
  name: "Parameter A",
  slug: "parameter-a",
  id: "fed1b910",
  type: "date/single",
  sectionId: "date",
  default: "2026-01-05",
};

const PARAMETER_B = {
  name: "Parameter B",
  slug: "parameter-b",
  id: "fed1b911",
  type: "date/single",
  sectionId: "date",
  default: "2026-01-05",
};

const TAB_A = { id: 1, name: "Tab A" };

const TAB_B = { id: 2, name: "Tab B" };

describe("scenarios > dashboard > filters > reset & clear", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should reset the filters of all tabs to their default values and reload the dashcards", () => {
    H.createDashboardWithTabs({
      tabs: [TAB_A, TAB_B],
      parameters: [PARAMETER_A, PARAMETER_B],
      auto_apply_filters: false,
      dashcards: [
        {
          id: -1,
          dashboard_tab_id: TAB_A.id,
          size_x: 10,
          size_y: 4,
          row: 0,
          col: 0,
          card_id: ORDERS_QUESTION_ID,
          parameter_mappings: [
            {
              parameter_id: PARAMETER_A.id,
              card_id: ORDERS_QUESTION_ID,
              target: ["dimension", ORDERS_CREATED_AT_FIELD],
            },
          ],
        },
        {
          id: -2,
          dashboard_tab_id: TAB_B.id,
          size_x: 10,
          size_y: 4,
          row: 0,
          col: 0,
          card_id: ORDERS_COUNT_QUESTION_ID,
          parameter_mappings: [
            {
              parameter_id: PARAMETER_B.id,
              card_id: ORDERS_COUNT_QUESTION_ID,
              target: ["dimension", ORDERS_CREATED_AT_FIELD],
            },
          ],
        },
      ],
    }).then((dashboard) => H.visitDashboard(dashboard.id));

    H.getDashboardCard(0).findByText("73.99").should("be.visible");

    setDateFilter(PARAMETER_A.name, "01/01/2027");
    H.applyFilterButton().click();
    H.getDashboardCard(0).findByText("116.01").should("be.visible");
    H.getDashboardCard(0).findByText("73.99").should("not.exist");

    cy.findAllByTestId("tab-button-input-wrapper").eq(1).click();
    H.getDashboardCard(0).findByText("4").should("be.visible");

    setDateFilter(PARAMETER_B.name, "01/01/2026");
    H.applyFilterButton().click();
    H.getDashboardCard(0).findByText("5").should("be.visible");

    cy.findByLabelText("Move, trash, and more…").click();
    H.popover().findByText("Reset all filters").click();
    filter(PARAMETER_B.name).findByText("January 5, 2026").should("exist");
    H.getDashboardCard(0).findByText("4").should("be.visible");

    cy.findAllByTestId("tab-button-input-wrapper").eq(0).click();
    filter(PARAMETER_A.name).findByText("January 5, 2026").should("exist");
    H.getDashboardCard(0).findByText("73.99").should("be.visible");
    H.getDashboardCard(0).findByText("116.01").should("not.exist");
  });

  it("should align the chevron icons in the temporal unit parameter sidebar", () => {
    const parameter = {
      name: "Unit of Time",
      slug: "unit_of_time",
      id: "fed1b912",
      type: "temporal-unit",
      sectionId: "temporal-unit",
    };
    const questionDetails: StructuredQuestionDetails = {
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [ORDERS_CREATED_AT_FIELD],
      },
    };

    H.createQuestionAndDashboard({
      questionDetails,
      dashboardDetails: { parameters: [parameter] },
    }).then(({ body: { dashboard_id }, questionId }) => {
      H.updateDashboardCards({
        dashboard_id,
        cards: [
          {
            card_id: questionId,
            parameter_mappings: [
              {
                parameter_id: parameter.id,
                card_id: questionId,
                target: ["dimension", ORDERS_CREATED_AT_FIELD],
              },
            ],
          },
        ],
      });
      H.visitDashboard(dashboard_id);
    });

    H.editDashboard();
    cy.findByTestId("edit-dashboard-parameters-widget-container")
      .findByText(parameter.name)
      .click();
    H.dashboardParameterSidebar()
      .findAllByLabelText("chevrondown icon")
      .should("have.length", 2)
      .then(([$firstChevron, $secondChevron]) => {
        const firstRect = $firstChevron.getBoundingClientRect();
        const secondRect = $secondChevron.getBoundingClientRect();

        expect(firstRect.left, "left").to.eq(secondRect.left);
        expect(firstRect.right, "right").to.eq(secondRect.right);
      });
  });

  it("should save the edited default value of a filter, and keep a long value inside the filter box (metabase#59306)", () => {
    const filterOne = {
      name: "Filter One",
      slug: "filter_one",
      id: "904aa8b7",
      type: "string/=",
      sectionId: "string",
      // an input box, like the filter in metabase#59306, instead of the list of categories
      values_query_type: "none",
    };
    const filterTwo = {
      name: "Filter Two",
      slug: "filter_two",
      id: "904aa8b8",
      type: "string/=",
      sectionId: "string",
      default: "Bar",
    };

    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Return input value",
        display: "scalar",
        query: { "source-table": PRODUCTS_ID },
      },
      dashboardDetails: {
        name: "Filters Dashboard",
        parameters: [filterOne, filterTwo],
      },
    }).then(({ body: dashboardCard }) => {
      const { card_id, dashboard_id } = dashboardCard;

      H.editDashboardCard(dashboardCard, {
        parameter_mappings: [
          {
            parameter_id: filterOne.id,
            card_id,
            target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          },
          {
            parameter_id: filterTwo.id,
            card_id,
            target: ["dimension", ["field", PRODUCTS.TITLE, null]],
          },
        ],
      }).then(() => {
        cy.wrap(dashboard_id).as("dashboardId");
        H.visitDashboard(dashboard_id);
      });
    });

    H.filterWidget().contains("Bar").should("be.visible");

    H.editDashboard();
    H.filterWidget({ name: "Filter Two", isEditing: true }).click();
    H.sidebar().within(() => {
      cy.findByLabelText("Input box").click();
      cy.findByLabelText("No default").parent().icon("close").click();
    });
    setDefaultFilterValue("Foo");
    cy.location("search").should("eq", "?filter_one=&filter_two=Foo");
    H.saveDashboard();

    cy.log("the saved default value is used after a reload");
    cy.get<number>("@dashboardId").then((dashboardId) => {
      // the URL alone could come from the last used value of the filter
      cy.request("GET", `/api/dashboard/${dashboardId}`).then(({ body }) => {
        expect(
          body.parameters.map(({ id, default: value }: Parameter) => ({
            id,
            default: value,
          })),
        ).to.deep.eq([
          { id: filterOne.id, default: undefined },
          { id: filterTwo.id, default: ["Foo"] },
        ]);
      });
      H.visitDashboard(dashboardId);
    });
    cy.location("search").should("eq", "?filter_one=&filter_two=Foo");
    H.filterWidget().contains("Foo").should("be.visible");

    cy.log("Keep a long value inside the filter box (metabase#59306)");
    H.filterWidget({ name: "Filter One" }).click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter some text")
        .type("asdf".repeat(20))
        .invoke("outerWidth")
        .should("be.lt", 400);
    });
  });
});

function filter(label: string) {
  return cy.findByLabelText(label);
}

function setDateFilter(label: string, value: string) {
  filter(label).click();
  H.popover().findByRole("textbox").clear().type(value).blur();
  H.popover()
    .button(/(Add|Update) filter/)
    .click();
}

function setDefaultFilterValue(value: string) {
  H.sidebar().within(() => {
    cy.findByLabelText("No default").click();
  });
  H.popover().within(() => {
    cy.findByPlaceholderText("Enter some text").type(value);
    cy.button("Add filter").click();
  });
}
