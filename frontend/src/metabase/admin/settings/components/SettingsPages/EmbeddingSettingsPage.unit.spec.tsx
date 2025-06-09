import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { findRequests } from "__support__/utils";
import { createMockSettings } from "metabase-types/api/mocks";

import { EmbeddingSettingsPage } from "./EmbeddingSettingsPage";

const setup = async () => {
  const settings = createMockSettings();

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(<EmbeddingSettingsPage />);
};

describe("EmbeddingSettingsPage", () => {
  it("shows an index of embedding settings sections", async () => {
    await setup();

    expect(await screen.findByText("Embedding")).toBeInTheDocument(); // title
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

    const toggle = await within(
      await screen.findByLabelText("Static embedding"),
    ).findByText("Disabled");

    await userEvent.click(toggle);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/enable-embedding-static");
    expect(body).toEqual({ value: true });
  });

  // note: the various states of the embedding cards are extensively tested elsewhere
});
