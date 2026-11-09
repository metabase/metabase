import userEvent from "@testing-library/user-event";

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

// Everything up to the data segregation step is done.
const TENANTS_ENABLED_CHECKLIST: Partial<SetupGuideChecklist> = {
  "enable-tenants": true,
  "move-dashboard-to-shared": true,
};

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

const chooseStrategy = async (strategyLabel: RegExp, confirmText: string) => {
  await userEvent.click(
    await screen.findByRole("radio", { name: strategyLabel }),
  );
  await userEvent.click(screen.getByRole("button", { name: confirmText }));
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

  it("selecting database routing strategy should show documentation link in step 3", async () => {
    setup({ checklist: TENANTS_ENABLED_CHECKLIST });

    await chooseStrategy(/Database routing/, "Use database routing");

    expect(
      await screen.findByText("Manage data permissions with database routing"),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /View the guide/i }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/permissions/database-routing"),
    );
  });
});
