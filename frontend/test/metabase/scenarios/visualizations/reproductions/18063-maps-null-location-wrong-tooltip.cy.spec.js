import { restore, popover, tippyPopover } from "__support__/e2e/cypress";

const questionDetails = {
  name: "18063",
  native: {
    query:
      'select null "LATITUDE", null "LONGITUDE", null "COUNT", \'NULL ROW\' "NAME"\nunion all select 55.6761, 12.5683, 1, \'Copenhagen\'\n',
    "template-tags": {},
  },
  display: "map",
};

describe.skip("issue 18063", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    // Select a Pin map
    cy.findByTestId("viz-settings-button").click();
    cy.get(".AdminSelect")
      .contains("Region map")
      .click();

    popover()
      .contains("Pin map")
      .click();

    // Click anywhere to close both popovers that open automatically.
    // Please see: https://github.com/metabase/metabase/issues/18063#issuecomment-927836691
    cy.findByText("Map type").click();
    cy.findByText("Map type").click();
  });

  it("should show the correct tooltip details for pin map even when some locations are null (metabase#18063)", () => {
    selectFieldValue("Latitude field", "LATITUDE");
    selectFieldValue("Longitude field", "LONGITUDE");

    cy.get(".leaflet-marker-icon").trigger("mousemove");

    tippyPopover().within(() => {
      testPairedTooltipValues("LATITUDE", "55.6761");
      testPairedTooltipValues("LONGITUDE", "12.5683");
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

  popover()
    .contains(value)
    .click();
}

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1)
    .closest("td")
    .siblings("td")
    .findByText(val2);
}
