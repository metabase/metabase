import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { InteractiveEmbeddingAuthorizedOriginsWidget } from "./InteractiveEmbeddingAuthorizedOriginsWidget";

const setup = async ({ enabled }: { enabled: boolean }) => {
  const settings = createMockSettings({
    "enable-embedding-interactive": enabled,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  renderWithProviders(<InteractiveEmbeddingAuthorizedOriginsWidget />);
};

describe("InteractiveEmbeddingAuthorizedOriginsWidget", () => {
  it("should allow changing authorized origins", async () => {
    await setup({ enabled: true });

    const input = await screen.findByPlaceholderText("https://*.example.com");
    await userEvent.type(input, "https://*.foo.example.com");
    fireEvent.blur(input);
    await screen.findByDisplayValue("https://*.foo.example.com");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    expect(url).toContain("/setting/embedding-app-origins-interactive");
    expect(body).toEqual({ value: "https://*.foo.example.com" });
  });
});
