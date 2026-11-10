const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type {
  DashboardDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { CardId, DashboardParameterMapping } from "metabase-types/api";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const { PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

describe("scenarios > custom column > boolean functions", () => {
  const expressionName = "Boolean column";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("dashboards", () => {
    const questionDetails: StructuredQuestionDetails = {
      name: "Q1",
      query: {
        "source-table": PEOPLE_ID,
        fields: [
          ["field", PEOPLE.NAME, { "base-type": "type/Text" }],
          ["expression", expressionName, { "base-type": "type/Boolean" }],
        ],
        expressions: {
          [expressionName]: [
            "starts-with",
            ["field", PEOPLE.NAME, null],
            "Sydney",
          ],
        },
      },
    };

    const parameterDetails = {
      name: "City",
      slug: "city",
      id: "27454068",
      type: "string/contains",
      sectionId: "string",
    };

    const dashboardDetails: DashboardDetails = {
      name: "D1",
      parameters: [parameterDetails],
    };

    function getParameterMapping(cardId: CardId): DashboardParameterMapping {
      return {
        card_id: cardId,
        parameter_id: parameterDetails.id,
        target: [
          "dimension",
          ["field", PEOPLE.CITY, { "base-type": "type/Text" }],
        ],
      };
    }

    function createDashboardWithQuestion(opts?: DashboardDetails) {
      return H.createDashboard({ ...dashboardDetails, ...opts }).then(
        ({ body: dashboard }) => {
          return H.createQuestion(questionDetails).then(({ body: card }) => {
            return cy
              .request("PUT", `/api/dashboard/${dashboard.id}`, {
                dashcards: [
                  createMockDashboardCard({
                    card_id: card.id,
                    parameter_mappings: [getParameterMapping(card.id)],
                    size_x: 8,
                    size_y: 8,
                  }),
                ],
              })
              .then(() => dashboard);
          });
        },
      );
    }

    function setupOpenDashboardClickBehavior(targetDashboardName: string) {
      H.editDashboard();
      H.showDashboardCardActions();
      H.getDashboardCard().findByLabelText("Click behavior").click();
      H.sidebar().within(() => {
        cy.findByText(expressionName).click();
        cy.findByText("Go to a custom destination").click();
        cy.findByText("Dashboard").click();
      });
      H.entityPickerModal().within(() => {
        cy.findByText(targetDashboardName).click();
      });
      H.sidebar()
        .findByTestId("click-mappings")
        .findByText(parameterDetails.name)
        .click();
      H.popover().findByText(expressionName).click();
      H.saveDashboard();
    }

    function clickFalseValueAndVerifyFilteredCard() {
      H.getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("be.visible");
        cy.findByText("Sydney Rempel").should("not.exist");
        cy.findAllByText("false").first().click();
      });
      H.getDashboardCard().within(() => {
        cy.findByText("Hudson Borer").should("not.exist");
        cy.findByText("Sydney Rempel").should("be.visible");
      });
    }

    it("should be able setup an 'open dashboard' click behavior for the same and for another dashboard", () => {
      createDashboardWithQuestion({ name: "D2" }).then((dashboard) =>
        cy.wrap(dashboard.id).as("otherDashboardId"),
      );
      createDashboardWithQuestion({ name: "D1" }).then((dashboard) =>
        H.visitDashboard(dashboard.id),
      );

      cy.log("same dashboard");
      setupOpenDashboardClickBehavior("D1");
      clickFalseValueAndVerifyFilteredCard();
      cy.findByTestId("dashboard-name-heading").should("have.value", "D1");

      cy.log("another dashboard");
      cy.get<number>("@otherDashboardId").then((dashboardId) =>
        H.visitDashboard(dashboardId),
      );
      setupOpenDashboardClickBehavior("D1");
      clickFalseValueAndVerifyFilteredCard();
      cy.findByTestId("dashboard-name-heading").should("have.value", "D1");
    });
  });
});
