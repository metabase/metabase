import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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

    // The switch renders unchecked before the setting loads; wait for the
    // loaded (checked) state so clicking toggles it off, not on.
    await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
    await userEvent.click(screen.getByText(TOGGLE_LABEL));
    const [put] = await findRequests("PUT");
    expect(put.url).toMatch(/show-metabot/);
    expect(put.body).toEqual({
      value: false,
    });
  });
});
