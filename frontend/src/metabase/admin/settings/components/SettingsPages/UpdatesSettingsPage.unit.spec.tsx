import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { act } from "react-dom/test-utils";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import type { SettingKey, UpdateChannel } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { UpdatesSettingsPage } from "./UpdatesSettingsPage";

const setup = async (props: {
  updateChannel: UpdateChannel;
  isHosted: boolean;
  versionTag: string;
}) => {
  const updatesSettings = {
    "is-hosted?": props.isHosted,
    "check-for-updates": true,
    "update-channel": "latest",
    version: {
      date: "2025-03-19",
      src_hash: "4df5cf3e5e86b0cc7421d80e2a8835e2ce3afa7d",
      tag: props.versionTag,
      hash: "4742ea1",
    },
    "version-info": {
      beta: {
        version: "v1.54.0-beta",
        released: "2025-03-24",
      },
      latest: {
        version: "v1.53.8",
        released: "2025-03-25",
        patch: true,
      },
      nightly: {
        version: "v1.52.3",
        released: "2024-12-16",
      },
    },
  } as const;

  const settings = createMockSettings(updatesSettings);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(
    <div>
      <UpdatesSettingsPage />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("UpdatesSettingsPage", () => {
  it("should render a UpdatesSettingsPage", async () => {
    await act(() =>
      setup({
        isHosted: false,
        versionTag: "v1.53.8",
        updateChannel: "latest",
      }),
    );

    [
      "Check for updates",
      "Types of releases to check for",
      "You're running Metabase 1.53.8 which is the latest and greatest!",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("only version update notice should be visible when hosted", async () => {
    await act(() =>
      setup({
        isHosted: true,
        versionTag: "v1.53.8",
        updateChannel: "latest",
      }),
    );

    ["Check for updates", "Types of releases to check for"].forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Metabase Cloud keeps your instance up-to-date. You're currently on version 1.53.8. Thanks for being a customer!",
      ),
    ).toBeInTheDocument();
  });

  it("should load initial settings", async () => {
    await act(() =>
      setup({
        isHosted: false,
        versionTag: "v1.53.8",
        updateChannel: "latest",
      }),
    );

    expect(
      await screen.findByDisplayValue("Stable releases"),
    ).toBeInTheDocument();
    expect(await screen.findByRole("switch")).toBeChecked();
  });

  it("should update multiple settings", async () => {
    await setup({
      isHosted: false,
      versionTag: "v1.53.8",
      updateChannel: "latest",
    });

    await userEvent.click(await screen.findByDisplayValue("Stable releases"));
    await userEvent.click(screen.getByText("Beta releases"));
    await userEvent.click(await screen.findByRole("switch"));

    await waitFor(async () => {
      const puts = await findPuts();
      expect(puts).toHaveLength(2);
    });

    const puts = await findPuts();
    const [updateChannelPutUrl, updateChannelPutDetails] = puts[0];
    const [checkForUpdatesUrl, checkForUpdatesDetails] = puts[1];

    expect(updateChannelPutUrl).toContain("/api/setting/update-channel");
    expect(updateChannelPutDetails).toEqual({ value: "beta" });

    expect(checkForUpdatesUrl).toContain("/api/setting/check-for-updates");
    expect(checkForUpdatesDetails).toEqual({ value: false });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check icon");
      expect(toasts).toHaveLength(2);
    });
  });
});

async function findPuts() {
  const calls = fetchMock.calls();
  const data = calls.filter((call) => call[1]?.method === "PUT") ?? [];

  const puts = data.map(async ([putUrl, putDetails]) => {
    const body = ((await putDetails?.body) as string) ?? "{}";

    return [putUrl, JSON.parse(body ?? "{}")];
  });

  return Promise.all(puts);
}
