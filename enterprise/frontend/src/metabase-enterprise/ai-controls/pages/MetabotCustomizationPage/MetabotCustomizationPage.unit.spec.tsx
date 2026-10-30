import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupSettingsEndpoints,
  setupStatefulSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { EnterpriseSettingKey } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { MetabotCustomizationPage } from "./MetabotCustomizationPage";

function setup({
  metabotName = "Metabot",
  metabotIcon = "metabot",
  showIllustrations = true,
}: {
  metabotName?: string;
  metabotIcon?: string | null;
  showIllustrations?: boolean;
} = {}) {
  const settings = createMockSettings({
    "metabot-name": metabotName,
    "metabot-icon": metabotIcon,
    "metabot-show-illustrations": showIllustrations,
  });

  setupStatefulSettingsEndpoints(settings);
  setupSettingsEndpoints([]);

  // Seed the store state too: without it, the render harness seeds the
  // settings bootstrap with *defaults*, and assertions can run against the
  // bootstrap-rendered UI before the mocked properties fetch resolves.
  renderWithProviders(<MetabotCustomizationPage />, {
    storeInitialState: { settings: mockSettings(settings) },
  });
}

async function getSettingUpdateBodies(
  settingKey: EnterpriseSettingKey,
): Promise<unknown[]> {
  const requests = await findRequests("PUT");
  return requests
    .filter(({ url }) => url.endsWith(`/api/setting/${settingKey}`))
    .map(({ body }): unknown => body);
}

// jsdom does not decode images, so fire the load event that a browser fires
// for an intact image.
function mockImageDecoding() {
  return jest
    .spyOn(HTMLImageElement.prototype, "src", "set")
    .mockImplementation(function (this: HTMLImageElement) {
      setTimeout(() => this.dispatchEvent(new Event("load")));
    });
}

function getIconFileInput() {
  return checkNotNull(
    document.querySelector<HTMLInputElement>('input[type="file"]'),
  );
}

describe("MetabotCustomizationPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the name input with the current metabot name", async () => {
    setup({ metabotName: "My AI Assistant" });

    const nameInput = await screen.findByDisplayValue("My AI Assistant");
    expect(nameInput).toBeInTheDocument();
  });

  it("shows default icon state when no custom icon is set", async () => {
    setup({ metabotIcon: "metabot" });

    await screen.findByText("AI agent's icon");
    expect(
      screen.queryByRole("button", { name: /Remove custom icon/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Show Metabot illustrations/ }),
    ).toBeChecked();
  });

  it("shows the remove button and illustrations toggle when a custom icon is set", async () => {
    setup({ metabotIcon: "data:image/png;base64,abc123" });

    await screen.findByText("AI agent's icon");
    expect(
      screen.getByRole("button", { name: /Remove custom icon/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Metabot illustrations")).toBeInTheDocument();
    expect(
      screen.getByAltText("Metabot illustration preview"),
    ).toBeInTheDocument();
  });

  it("shows the custom icon preview image when a custom icon is set", async () => {
    setup({ metabotIcon: "data:image/png;base64,abc123" });

    const preview = await screen.findByAltText("Metabot icon");
    expect(preview).toHaveAttribute("src", "data:image/png;base64,abc123");
  });

  it("saves the name once after the user stops typing", async () => {
    setup({ metabotName: "Metabot" });

    const nameInput = await screen.findByLabelText("AI agent's name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "HAL 9000");

    await waitFor(async () =>
      expect(await getSettingUpdateBodies("metabot-name")).toEqual([
        { value: "HAL 9000" },
      ]),
    );
  });

  it("saves an uploaded icon and offers to remove it", async () => {
    mockImageDecoding();
    setup({ metabotIcon: "metabot" });

    await screen.findByText("AI agent's icon");
    await userEvent.upload(
      getIconFileInput(),
      new File(["icon"], "metabot-icon.png", { type: "image/png" }),
    );

    await waitFor(async () =>
      expect(await getSettingUpdateBodies("metabot-icon")).toEqual([
        { value: expect.stringMatching(/^data:image\/png;base64,/) },
      ]),
    );
    expect(
      await screen.findByRole("button", { name: /Remove custom icon/ }),
    ).toBeInTheDocument();
  });

  it("saves the illustrations setting when it is turned off", async () => {
    setup({ showIllustrations: true });

    const toggle = await screen.findByRole("switch", {
      name: /Show Metabot illustrations/,
    });
    await waitFor(() => expect(toggle).toBeChecked());
    await userEvent.click(toggle);

    await waitFor(async () =>
      expect(
        await getSettingUpdateBodies("metabot-show-illustrations"),
      ).toEqual([{ value: false }]),
    );
  });

  it("keeps the illustrations toggle after turning illustrations on with the default icon", async () => {
    setup({ showIllustrations: false });

    const toggle = await screen.findByRole("switch", {
      name: /Show Metabot illustrations/,
    });
    await userEvent.click(toggle);

    const call = fetchMock.callHistory.lastCall(
      "path:/api/setting/metabot-show-illustrations",
      { method: "PUT" },
    );
    expect(await call?.request?.json()).toEqual({ value: true });
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /Show Metabot illustrations/ }),
      ).toBeChecked(),
    );
  });
});
