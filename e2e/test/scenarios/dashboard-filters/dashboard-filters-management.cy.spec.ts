const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Dashboard } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

// The settings of the sidebar (disconnect, type, operator, default value) are
// covered in `DashboardApp.unit.spec.tsx`. This test checks that the backend
// saves what the sidebar changed.
describe("scenarios > dashboard > filters > management", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should save a changed operator and a changed type with the reset mappings and default value", () => {
    const textFilter = createMockParameter({
      name: "Text",
      slug: "string",
      id: "5aefc726",
      type: "string/=",
      sectionId: "string",
      default: "value to check default",
    });
    const locationFilter = createMockParameter({
      name: "Location",
      slug: "location",
      id: "5aefc725",
      type: "string/=",
      sectionId: "location",
    });

    H.createDashboardWithQuestions({
      dashboardDetails: { parameters: [textFilter, locationFilter] },
      questions: [{ query: { "source-table": PEOPLE_ID, limit: 5 } }],
    }).then(({ dashboard, questions: [peopleCard] }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: peopleCard.id,
            parameter_mappings: [
              {
                parameter_id: textFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.NAME, null]],
              },
              {
                parameter_id: locationFilter.id,
                card_id: peopleCard.id,
                target: ["dimension", ["field", PEOPLE.STATE, null]],
              },
            ],
          },
        ],
      });
      cy.wrap(dashboard.id).as("dashboardId");
      H.visitDashboard(dashboard.id);
    });

    H.filterWidget().should("contain", "Text").and("contain", "Location");
    H.editDashboard();

    H.editingDashboardParametersContainer().findByText("Text").click();
    H.getDashboardCard().should("contain", "People.Name");
    H.sidebar().findByText("value to check default").should("exist");
    H.sidebar().findByText("Filter operator").next().click();
    H.popover().findByText("Contains").click();
    H.sidebar().findByText("No default").should("exist");

    H.editingDashboardParametersContainer().findByText("Location").click();
    H.getDashboardCard().should("contain", "People.State");
    H.sidebar().findByText("Filter or parameter type").next().click();
    H.popover().findByText("Number").click();
    H.getDashboardCard().should("not.contain", "People.State");

    H.saveDashboard();
    cy.reload();

    H.filterWidget().should("contain", "Text").and("not.contain", "Location");

    cy.get<number>("@dashboardId").then((dashboardId) => {
      cy.request<Dashboard>("GET", `/api/dashboard/${dashboardId}`).then(
        ({ body: { parameters, dashcards } }) => {
          const [text, location] = parameters ?? [];
          expect(text).to.include({
            id: textFilter.id,
            type: "string/contains",
            sectionId: "string",
          });
          expect(text.default ?? null).to.equal(null);
          expect(location).to.include({
            id: locationFilter.id,
            type: "number/=",
            sectionId: "number",
          });
          expect(
            dashcards[0].parameter_mappings?.map(
              ({ parameter_id }) => parameter_id,
            ),
          ).to.deep.equal([textFilter.id]);
        },
      );
    });
  });
});
