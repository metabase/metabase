const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type { Parameter } from "metabase-types/api";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const FILTER: Parameter = {
  name: "Category",
  slug: "category",
  id: "2a12e66c",
  type: "string/=",
  sectionId: "string",
};

const QUESTION_DETAILS: StructuredQuestionDetails = {
  name: "Products table",
  query: { "source-table": PRODUCTS_ID },
};

const filterToggleLabel = "Auto-apply filters";

// The UI of auto-apply filters (draft values, the apply toast, default values,
// editing, permissions and full-app embedding) is covered by Jest in
// DashboardApp.auto-apply-filters.unit.spec.tsx. This test keeps what needs
// the real backend: the setting persists, queries return the filtered rows,
// and the Snowplow event matches its schema.
describe("scenarios > dashboards > filters > auto apply", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.enableTracking();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/dashboard/*").as("updateDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "cardQuery",
    );
  });

  it("should persist turning auto-apply filters off and on, and apply draft values with the apply button", () => {
    createDashboard();
    H.visitDashboard("@dashboardId");
    cy.wait("@cardQuery");

    cy.log("changing a value reloads the card while auto-apply is on");
    H.filterWidget().findByText(FILTER.name).click();
    H.popover().within(() => {
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    cy.wait("@cardQuery")
      .its("request.body.parameters.0.value")
      .should("deep.equal", ["Gadget"]);
    H.assertTableRowsCount(53);

    cy.log("turn auto-apply off");
    H.openDashboardSettingsSidebar();
    H.sidesheet().within(() => {
      cy.findByLabelText(filterToggleLabel).should("be.checked").click();
      cy.wait("@updateDashboard").then(({ request, response }) => {
        expect(request.body).to.deep.equal({ auto_apply_filters: false });
        expect(response?.statusCode).to.equal(200);
      });
      cy.findByLabelText(filterToggleLabel).should("not.be.checked");
    });
    H.expectUnstructuredSnowplowEvent({
      event: "auto_apply_filters_disabled",
    });

    cy.log("the setting is kept after a reload");
    H.visitDashboard("@dashboardId");
    cy.wait("@cardQuery");
    H.filterWidget().findByText("Gadget").should("be.visible");
    H.assertTableRowsCount(53);
    H.openDashboardSettingsSidebar();
    H.sidesheet().findByLabelText(filterToggleLabel).should("not.be.checked");
    H.closeDashboardSettingsSidebar();

    cy.log("draft values are applied with the apply button");
    H.filterWidget().findByText("Gadget").click();
    H.popover().within(() => {
      cy.findByText("Widget").click();
      cy.button("Update filter").click();
    });
    H.applyFilterToast().findByText("1 filter changed");
    H.assertTableRowsCount(53);
    H.applyFilterButton().click();
    cy.wait("@cardQuery")
      .its("request.body.parameters.0.value")
      .should("deep.equal", ["Gadget", "Widget"]);
    H.assertTableRowsCount(107);

    cy.log("turning auto-apply on does not send an event");
    H.openDashboardSettingsSidebar();
    H.sidesheet().within(() => {
      cy.findByLabelText(filterToggleLabel).click();
      cy.wait("@updateDashboard")
        .its("request.body")
        .should("deep.equal", { auto_apply_filters: true });
      cy.findByLabelText(filterToggleLabel).should("be.checked");
    });
    H.expectUnstructuredSnowplowEvent(
      { event: "auto_apply_filters_disabled" },
      1,
    );
    H.expectNoBadSnowplowEvents();
  });
});

const createDashboard = () => {
  H.createQuestionAndDashboard({
    questionDetails: QUESTION_DETAILS,
    dashboardDetails: { parameters: [FILTER] },
  }).then(({ body: card }) => {
    H.editDashboardCard(card, {
      parameter_mappings: [
        {
          card_id: card.card_id,
          parameter_id: FILTER.id,
          target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
        },
      ],
    });
    cy.wrap(card.dashboard_id).as("dashboardId");
  });
};
