import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
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

import { StaticEmbeddingSettings } from "./StaticEmbeddingSettings";

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
    key: "upsell-dev_instances",
    value: true,
  });

  renderWithProviders(<StaticEmbeddingSettings />);

  await screen.findByText("Static embedding"); // breadcrumb
};

describe("StaticEmbeddingSettings", () => {
  it("should show embedding toggle", async () => {
    await setup({ enabled: true });

    expect(
      await screen.findByText("Enable static embedding"),
    ).toBeInTheDocument();
  });

  it("should toggle static embedding on", async () => {
    await setup({ enabled: false });
    const toggle = await screen.findByText("Enable static embedding");

    await userEvent.click(toggle);
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/enable-embedding-static");
    expect(body).toEqual({ value: true });
  });

  it("should show embeddable dashboards and cards when embedding is enabled", async () => {
    await setup({ enabled: true });

    expect(await screen.findByText("My cool dashboard")).toBeInTheDocument();
    expect(await screen.findByText("My cool card")).toBeInTheDocument();
  });

  it("should hide embeddable dashboards and cards when embedding is disabled", async () => {
    await setup({ enabled: false });
    expect(
      await screen.findByText("Enable static embedding"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Manage embeds")).not.toBeInTheDocument();
  });

  it("should show the embedding secret key input", async () => {
    await setup({ enabled: true });

    expect(await screen.findByText("Embedding secret key")).toBeInTheDocument();
  });

  it("should generate a new embedding secret key", async () => {
    await setup({ enabled: true });

    expect(await screen.findByText("Embedding secret key")).toBeInTheDocument();
    const generateButton = screen.getByRole("button", { name: "Generate key" });
    await userEvent.click(generateButton);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/embedding-secret-key");
    expect(body).toEqual({ value: "fake-token" }); // we got this from the mock api
  });
});
