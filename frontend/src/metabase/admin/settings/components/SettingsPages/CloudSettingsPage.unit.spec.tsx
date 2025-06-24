import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { CloudSettingsPage } from "./CloudSettingsPage";

const setup = ({ hosting }: { hosting: boolean }) => {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ hosting }),
  });

  fetchMock.get("path:/api/cloud-migration", { status: 204 });
  setupPropertiesEndpoints(settings);

  renderWithProviders(<CloudSettingsPage />, {
    storeInitialState: {
      // upsells only display to admins
      currentUser: createMockUser({ is_superuser: true }),
    },
  });
};

describe("CloudSettingsPage", () => {
  it("should show migration upsell for admins without hosting", async () => {
    await setup({ hosting: false });

    expect(
      await screen.findByText("Migrate to Metabase Cloud"),
    ).toBeInTheDocument();
  });

  it("should show link to store for users with hosting", async () => {
    await setup({ hosting: true });

    expect(
      await screen.findByText("Go to the Metabase Store"),
    ).toBeInTheDocument();
  });
});
