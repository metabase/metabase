import fetchMock from "fetch-mock";

import {
  setupEmbeddableEntitiesEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockCard,
  createMockDashboard,
  createMockSettings,
} from "metabase-types/api/mocks";

import { GuestEmbedsSettings } from "./GuestEmbedsSettings";

const setup = async ({ enabled }: { enabled: boolean }) => {
  const settings = createMockSettings({ "enable-embedding-static": enabled });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupEmbeddableEntitiesEndpoints({
    dashboards: [createMockDashboard({ name: "My cool dashboard" })],
    cards: [createMockCard({ name: "My cool card" })],
  });

  fetchMock.get("path:/api/util/random_token", {
    token: "fake-token",
  });
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-embedded-analytics-js",
    value: true,
  });

  renderWithProviders(<GuestEmbedsSettings />);

  expect(await screen.findAllByText("Guest embeds")).toHaveLength(1); // Title
  expect(await screen.findAllByText("Enable guest embeds")).toHaveLength(1); // Card
};

describe("GuestEmbedsSettings", () => {
  it("should show cards with related settings", async () => {
    await setup({ enabled: true });

    const relatedSettingCards = await screen.findAllByTestId(
      "related-setting-card",
    );
    expect(relatedSettingCards).toHaveLength(5);

    expect(await screen.findByText("Security")).toBeInTheDocument();
    expect(await screen.findByText("Databases")).toBeInTheDocument();
    expect(await screen.findByText("People")).toBeInTheDocument();
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
    expect(await screen.findByText("Appearance")).toBeInTheDocument();
  });
});
