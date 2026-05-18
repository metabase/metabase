import userEvent from "@testing-library/user-event";

import { setupPropertiesEndpoints } from "__support__/server-mocks/session";
import { setupSettingsEndpoints, setupUpdateSettingEndpoint } from "__support__/server-mocks/settings";
import { findRequests } from "__support__/server-mocks/util";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { MetabotToggleWidget } from "./MetabotToggleWidget";

const TOGGLE_LABEL = "Display welcome message on the homepage";

const setup = (value = true) => {
  setupPropertiesEndpoints(
    createMockSettings({
      "show-metabot": !!value,
    }),
  );
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([]);
  renderWithProviders(<MetabotToggleWidget />, {});
};

describe("MetabotToggleWidget", () => {
  it("should enable Metabot", async () => {
    setup(false);

    await userEvent.click(screen.getByText(TOGGLE_LABEL));
    const [put] = await findRequests("PUT");
    expect(put.url).toMatch(/show-metabot/);
    expect(put.body).toEqual({
      value: true,
    });
  });

  it("should disable Metabot", async () => {
    setup(true);

    await userEvent.click(screen.getByText(TOGGLE_LABEL));
    const [put] = await findRequests("PUT");
    expect(put.url).toMatch(/show-metabot/);
    expect(put.body).toEqual({
      value: false,
    });
  });
});
