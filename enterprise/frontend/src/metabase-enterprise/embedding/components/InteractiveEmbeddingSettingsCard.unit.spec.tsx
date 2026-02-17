import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { InteractiveEmbeddingSettingsCard } from "./InteractiveEmbeddingSettingsCard";

const setup = async ({ enabled }: { enabled: boolean }) => {
  const settings = createMockSettings({
    "enable-embedding-interactive": enabled,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupUpdateSettingsEndpoint();
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-dev_instances",
    value: true,
  });

  renderWithProviders(<InteractiveEmbeddingSettingsCard />);
};

describe("InteractiveEmbeddingSettingsCard", () => {
  it("should show interactive embedding toggle", async () => {
    await setup({ enabled: true });

    expect(
      await screen.findByText("Enable full app embedding"),
    ).toBeInTheDocument();
  });

  it("should show a link to the doc", async () => {
    await setup({ enabled: true });

    const linkToDoc = await screen.findByRole("link", {
      name: "Documentation",
    });

    expect(linkToDoc).toBeVisible();
    expect(linkToDoc).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/full-app-embedding.html",
    );
  });

  it("should toggle interactive embedding on", async () => {
    await setup({ enabled: false });
    const toggle = await screen.findByLabelText(
      "Enable full app embedding toggle",
    );

    await userEvent.click(toggle);
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting");
    expect(body).toEqual({ "enable-embedding-interactive": true });
  });

  it("should allow changing authorized origins", async () => {
    await setup({ enabled: true });

    const input = await screen.findByPlaceholderText("https://*.example.com");
    await userEvent.type(input, "https://*.foo.example.com");
    await fireEvent.blur(input);
    await screen.findByDisplayValue("https://*.foo.example.com");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/embedding-app-origins-interactive");
    expect(body).toEqual({ value: "https://*.foo.example.com" });
  });
});
