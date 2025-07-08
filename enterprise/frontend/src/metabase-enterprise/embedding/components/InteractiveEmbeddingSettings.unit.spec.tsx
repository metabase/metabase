import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { InteractiveEmbeddingSettings } from "./InteractiveEmbeddingSettings";

const setup = async ({ enabled }: { enabled: boolean }) => {
  const settings = createMockSettings({
    "enable-embedding-interactive": enabled,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-dev_instances",
    value: true,
  });

  renderWithProviders(<InteractiveEmbeddingSettings />);

  await screen.findByText("Interactive embedding"); // breadcrumb
};

describe("InteractiveEmbeddingSettings", () => {
  it("should show interactive embedding toggle", async () => {
    await setup({ enabled: true });

    expect(
      await screen.findByText("Enable interactive embedding"),
    ).toBeInTheDocument();
  });

  it("should toggle interactive embedding on", async () => {
    await setup({ enabled: false });
    const toggle = await screen.findByText("Enable interactive embedding");

    await userEvent.click(toggle);
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/enable-embedding-interactive");
    expect(body).toEqual({ value: true });
  });

  it("should show quickstart link", async () => {
    await setup({ enabled: true });

    expect(
      await screen.findByText("Check out the Quickstart"),
    ).toBeInTheDocument();
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

  it("should allow changing samesite cookie setting", async () => {
    await setup({ enabled: true });

    const button = await screen.findByText("Lax (default)");
    await userEvent.click(button);
    const newOption = await screen.findByText("Strict (not recommended)");
    await userEvent.click(newOption);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/session-cookie-samesite");
    expect(body).toEqual({ value: "strict" });
  });
});
