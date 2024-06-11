import { restore, popover, testPairedTooltipValues } from "e2e/support/helpers";

const questionDetails = {
  name: "18063",
  native: {
    query:
      'select null "LATITUDE", null "LONGITUDE", null "COUNT", \'NULL ROW\' "NAME"\nunion all select 55.6761, 12.5683, 1, \'Copenhagen\'\n',
    "template-tags": {},
  },
  display: "map",
};

describe("issue 18063", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    // Select a Pin map
    cy.findByTestId("viz-settings-button").click();
    cy.findAllByTestId("select-button").contains("Region map").click();

    popover().contains("Pin map").click();

    // Click anywhere to close both popovers that open automatically. Need to click twice to dismiss both popovers
    // Please see: https://github.com/metabase/metabase/issues/18063#issuecomment-927836691
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New question").click().click();
  });

  it("should show the correct tooltip details for pin map even when some locations are null (metabase#18063)", () => {
    selectFieldValue("Latitude field", "LATITUDE");
    selectFieldValue("Longitude field", "LONGITUDE");

    cy.get(".leaflet-marker-icon").trigger("mousemove");

    popover().within(() => {
      testPairedTooltipValues("LATITUDE", "55.68");
      testPairedTooltipValues("LONGITUDE", "12.57");
      testPairedTooltipValues("COUNT", "1");
      testPairedTooltipValues("NAME", "Copenhagen");
    });
  });
});

function selectFieldValue(field, value) {
  cy.findByText(field)
    .parent()
    .within(() => {
      cy.findByText("Select a field").click();
    });

  popover().findByText(value).click();
}
