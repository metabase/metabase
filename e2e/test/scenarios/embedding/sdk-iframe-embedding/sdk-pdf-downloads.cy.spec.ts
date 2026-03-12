const { H } = cy;
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { BaseEmbedTestPageOptions } from "e2e/support/helpers";

describe("scenarios > embedding > sdk iframe embedding > pdf downloads", () => {
  const setup = (options: Partial<BaseEmbedTestPageOptions>) => {
    const frame = H.loadSdkIframeEmbedTestPage({
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
            withDownloads: true,
          },
        },
      ],
      ...options,
    });

    cy.wait("@getDashCardQuery");

    // Check that the dashboard loaded fine
    frame.within(() => {
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders").should("be.visible");
      H.assertTableRowsCount(2000);
    });

    return frame;
  };

  beforeEach(() => {
    H.resetSnowplow();
    cy.deleteDownloadsFolder();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("Dashboard PDF downloads", () => {
    beforeEach(() => {
      H.prepareSdkIframeEmbedTest({ signOut: true });
    });

    it("should download dashboard as PDF with analytics tracking", () => {
      const frame = setup({
        metabaseConfig: {
          theme: {
            components: {
              dashboard: {
                backgroundColor: "transparent",
              },
            },
          },
        },
      });

      frame
        .should("contain", "Orders in a dashboard")
        .findByLabelText("Download as PDF")
        .should("be.visible")
        .click();

      // Verify PDF file download
      cy.verifyDownload("Orders in a dashboard.pdf");

      // Verify analytics tracking
      H.expectUnstructuredSnowplowEvent({
        dashboard_accessed_via: "sdk-embed",
        event: "dashboard_pdf_exported",
      });
    });

    it("should hide PDF download button when with-downloads is false", () => {
      const frame = setup({
        elements: [
          {
            component: "metabase-dashboard",
            attributes: {
              dashboardId: ORDERS_DASHBOARD_ID,
              withDownloads: false,
            },
          },
        ],
      });

      frame
        .should("contain", "Orders in a dashboard")
        .findByLabelText("Download as PDF")
        .should("not.exist");
    });
  });
});
