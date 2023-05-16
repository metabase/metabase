import { restore, filterWidget, visitDashboard } from "e2e/support/helpers";
import { setAdHocFilter } from "../../native-filters/helpers/e2e-date-filter-helpers";

describe("issue 17551", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion({
      native: {
        query:
          "select 'yesterday' as \"text\", dateadd('day', -1, current_date::date) as \"date\" union all\nselect 'today', current_date::date union all\nselect 'tomorrow', dateadd('day', 1, current_date::date)\n",
      },
    }).then(({ body: { id: baseQuestionId } }) => {
      const questionDetails = {
        name: "17551 QB",
        query: { "source-table": `card__${baseQuestionId}` },
      };

      const filter = {
        name: "Date Filter",
        slug: "date_filter",
        id: "888188ad",
        type: "date/all-options",
        sectionId: "date",
      };

      const dashboardDetails = { parameters: [filter] };

      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        const mapFilterToCard = {
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id,
              target: [
                "dimension",
                [
                  "field",
                  "date",
                  {
                    "base-type": "type/DateTime",
                  },
                ],
              ],
            },
          ],
        };

        cy.editDashboardCard(card, mapFilterToCard);

        visitDashboard(dashboard_id);
      });
    });
  });

  it("should include today in the 'All time' date filter when chosen 'Next' (metabase#17551)", () => {
    filterWidget().click();
    setAdHocFilter({ condition: "Next", includeCurrent: true });

    cy.url().should("include", "?date_filter=next30days~");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("tomorrow");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("today");
  });
});
