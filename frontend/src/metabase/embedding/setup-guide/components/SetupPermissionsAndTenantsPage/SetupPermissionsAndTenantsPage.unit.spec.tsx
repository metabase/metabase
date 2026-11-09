import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  createMockSetupGuideChecklist,
  setupCollectionTreeEndpoint,
  setupRootCollectionItemsEndpoint,
  setupSetupGuideChecklistEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupGuideChecklist } from "../../api/setup-guide";

import { SetupPermissionsAndTenantsPage } from "./SetupPermissionsAndTenantsPage";

const PAGE_PATH = "/embedding/get-started/permissions";

const SHARED_COLLECTION = createMockCollection({
  id: 42,
  name: "Shared collection",
});

const setup = ({
  checklist = {},
}: { checklist?: Partial<SetupGuideChecklist> } = {}) => {
  const settingsState = mockSettings({
    "token-features": createMockTokenFeatures({ tenants: true }),
    "use-tenants": true,
  });
  setupEnterpriseOnlyPlugin("tenants");

  setupSetupGuideChecklistEndpoint({
    checklist: createMockSetupGuideChecklist(checklist),
  });
  setupCollectionTreeEndpoint([SHARED_COLLECTION]);
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });

  renderWithProviders(
    <Route path={PAGE_PATH} element={<SetupPermissionsAndTenantsPage />} />,
    {
      storeInitialState: createMockState({ settings: settingsState }),
      withRouter: true,
      initialRoute: PAGE_PATH,
    },
  );
};

describe("SetupPermissionsAndTenantsPage", () => {
  it("renders the wizard heading", async () => {
    setup();

    expect(
      await screen.findByRole("heading", {
        name: "Configure data permissions and enable tenants",
        level: 1,
      }),
    ).toBeVisible();
  });
});
