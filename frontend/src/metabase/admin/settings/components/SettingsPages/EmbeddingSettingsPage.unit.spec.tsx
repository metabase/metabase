import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { EmbeddingSettingsPage } from "./EmbeddingSettingsPage";

const setup = async () => {
  const settings = createMockSettings();

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-dev_instances",
    value: true,
  });

  renderWithProviders(<EmbeddingSettingsPage />);
  expect(await screen.findByText("Embedding")).toBeInTheDocument(); // title
};

describe("EmbeddingSettingsPage", () => {
  it("shows an index of embedding settings sections", async () => {
    await setup();

    expect(await screen.findByText("Static embedding")).toBeInTheDocument();
    expect(
      await screen.findByText("Interactive embedding"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Embedded analytics SDK for React"),
    ).toBeInTheDocument();
  });

  it("can toggle static embedding on", async () => {
    await setup();

    const toggles = await screen.findAllByText("Disabled");

    await userEvent.click(toggles[0]);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/enable-embedding-static");
    expect(body).toEqual({ value: true });
  });

  // note: the various states of the embedding cards are extensively tested elsewhere
});
