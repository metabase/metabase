import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupEmbedThemesEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import {
  openMenu,
  setupDashboardSharingMenu,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/DashboardSharingMenu/tests/setup";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { EmbedSetupModals } from "../EmbedSetupModals";

function setupEmbedWizardEndpoints(dashboard: Dashboard) {
  const database = createMockDatabase();
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupSearchEndpoints([]);
  setupDatabasesEndpoints([database]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });
  setupDashboardEndpoints(dashboard);
  setupDashboardQueryMetadataEndpoint(
    dashboard,
    createMockDashboardQueryMetadata({ databases: [database] }),
  );
  setupEmbedThemesEndpoint([]);
  setupUpdateSettingEndpoint();
}

describe("EmbedSetupModals", () => {
  describe.each([
    { description: "without cards", dashcards: [] },
    {
      description: "with only a text card",
      dashcards: [
        createMockDashboardCard({
          card: createMockCard({ display: "text" }),
        }),
      ],
    },
  ])(
    "opened from the sharing menu of a dashboard $description (metabase#15077)",
    ({ dashcards }) => {
      it("should show the embed wizard", async () => {
        const { dashboard } = setupDashboardSharingMenu({
          isAdmin: true,
          isEmbeddingEnabled: true,
          dashboard: { dashcards },
          siblings: <EmbedSetupModals />,
          withRouter: true,
        });
        setupEmbedWizardEndpoints(dashboard);

        await openMenu();
        await userEvent.click(screen.getByText("Embed"));

        expect(
          await screen.findByTestId("sdk-iframe-embed-setup-modal-content"),
        ).toBeVisible();

        // The wizard saves its settings after a debounce; let that request
        // finish here so it does not land in a later test.
        await waitFor(
          () =>
            expect(
              fetchMock.callHistory.called(
                "path:/api/setting/sdk-iframe-embed-setup-settings",
              ),
            ).toBe(true),
          { timeout: 3000 },
        );
      });
    },
  );
});
