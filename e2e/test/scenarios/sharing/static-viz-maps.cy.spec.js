const { H } = cy;
import { USERS } from "e2e/support/cypress_data";

const { admin } = USERS;

// Smoke test for static-viz map rendering in email subscriptions. The unique thing this covers that the
// unit/Loki tests can't: that StaticChoropleth actually loads and renders in the real GraalJS server
// bundle (where Leaflet can't load) and gets embedded as an image in the subscription email — i.e. the
// whole detect -> resolve GeoJSON -> render -> attach pipeline is wired up.
//
// Pin/grid (tile-based) maps are intentionally NOT covered here: they render server-side from
// metabase.channel.render.maps and fetch OSM basemap tiles over the network, which would be flaky in
// e2e. Their rendering + routing are covered deterministically by the backend tests in
// metabase.channel.render.maps-test and metabase.channel.render.card-test.
describe("scenarios > sharing > static-viz maps", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setupSMTP();
  });

  it("renders a region (choropleth) map as an image in a subscription email", () => {
    // Sentinel metric values: if the card degraded to the table fallback they'd appear as table cells in
    // the email HTML. In the rendered map they're baked into the rasterized PNG, so they must be absent.
    const questionDetails = {
      name: "Region map static-viz smoke",
      native: {
        query:
          "SELECT 'CA' AS state, 99999 AS metric " +
          "UNION ALL SELECT 'NY' AS state, 11111 AS metric",
      },
      display: "map",
      visualization_settings: {
        "map.type": "region",
        "map.region": "us_states",
        "map.dimension": "STATE",
        "map.metric": "METRIC",
      },
    };

    H.createNativeQuestionAndDashboard({ questionDetails }).then(
      ({ dashboardId }) => {
        H.visitDashboard(dashboardId);
      },
    );

    H.openDashboardMenu("Subscriptions");
    H.sidebar().findByText("Email it").click();

    cy.findByPlaceholderText("Enter user names or email addresses").click();
    H.popover().findByText(`${admin.first_name} ${admin.last_name}`).click();
    // Click the "To:" label to close the recipient popover covering the send button.
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- closing the popover
    cy.findByText("To:").click();

    H.sendEmailAndAssert(({ html }) => {
      expect(html).not.to.include(
        "An error occurred while displaying this card.",
      );
      // The choropleth rasterized to a PNG that's embedded as an image...
      expect(html).to.include("<img");
      // ...so the underlying data never appears as table-cell text.
      expect(html).not.to.include("99999");
      expect(html).not.to.include("11111");
    });
  });
});
