import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";

import { ModelPersistenceConfiguration } from "./ModelPersistenceConfiguration";

const ENABLE_URL = "path:/api/persist/enable";
const DISABLE_URL = "path:/api/persist/disable";
const SET_SCHEDULE_URL = "path:/api/persist/set-refresh-schedule";
const SESSION_PROPERTIES_URL = "path:/api/session/properties";

interface SetupOpts {
  persistedModelsEnabled?: boolean;
  cronSchedule?: string;
}

const setup = ({
  persistedModelsEnabled = false,
  cronSchedule = "0 0 0/1 * * ? *",
}: SetupOpts = {}) => {
  const settings = createMockSettings({
    "persisted-models-enabled": persistedModelsEnabled,
    "persisted-model-refresh-cron-schedule": cronSchedule,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  fetchMock.post(ENABLE_URL, 204);
  fetchMock.post(DISABLE_URL, 204);
  fetchMock.post(SET_SCHEDULE_URL, 204);

  const state = createMockState({ settings: mockSettings(settings) });

  return renderWithProviders(<ModelPersistenceConfiguration />, {
    storeInitialState: state,
  });
};

describe("ModelPersistenceConfiguration", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  describe("initial render", () => {
    it("shows the switch as disabled when persistence is off", () => {
      setup({ persistedModelsEnabled: false });
      expect(screen.getByText("Disabled")).toBeInTheDocument();
      expect(screen.getByRole("switch")).not.toBeChecked();
    });

    it("shows the switch as enabled when persistence is on", () => {
      setup({ persistedModelsEnabled: true });
      expect(screen.getByText("Enabled")).toBeInTheDocument();
      expect(screen.getByRole("switch")).toBeChecked();
    });

    it("hides the refresh-interval picker when persistence is off", () => {
      setup({ persistedModelsEnabled: false });
      expect(
        screen.queryByText("Refresh models every…"),
      ).not.toBeInTheDocument();
    });

    it("shows the refresh-interval picker when persistence is on", () => {
      setup({ persistedModelsEnabled: true });
      expect(screen.getByText("Refresh models every…")).toBeInTheDocument();
    });
  });

  describe("toggle wiring", () => {
    it("calls POST /api/persist/enable when the switch is turned on", async () => {
      setup({ persistedModelsEnabled: false });

      await userEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(fetchMock.callHistory.called(ENABLE_URL)).toBe(true);
      });
      expect(fetchMock.callHistory.called(DISABLE_URL)).toBe(false);
    });

    it("calls POST /api/persist/disable when the switch is turned off", async () => {
      setup({ persistedModelsEnabled: true });

      await userEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(fetchMock.callHistory.called(DISABLE_URL)).toBe(true);
      });
      expect(fetchMock.callHistory.called(ENABLE_URL)).toBe(false);
    });

    it("refetches site settings after toggling", async () => {
      setup({ persistedModelsEnabled: false });

      await userEvent.click(screen.getByRole("switch"));

      await waitFor(() => {
        expect(fetchMock.callHistory.called(SESSION_PROPERTIES_URL)).toBe(true);
      });
    });
  });

  describe("refresh-interval picker", () => {
    it("calls POST /api/persist/set-refresh-schedule with the chosen cron when a preset is selected", async () => {
      setup({
        persistedModelsEnabled: true,
        cronSchedule: "0 0 0/2 * * ? *",
      });

      await userEvent.click(screen.getByDisplayValue("2 hours"));
      await userEvent.click(
        await screen.findByRole("option", { name: "6 hours" }),
      );

      await waitFor(() => {
        expect(fetchMock.callHistory.called(SET_SCHEDULE_URL)).toBe(true);
      });
      const lastCall = fetchMock.callHistory.lastCall(SET_SCHEDULE_URL);
      expect(JSON.parse(lastCall?.options?.body as string)).toEqual({
        cron: "0 0 0/6 * * ? *",
      });
    });

    it("reveals the cron input when 'Custom…' is selected", async () => {
      setup({
        persistedModelsEnabled: true,
        cronSchedule: "0 0 0/2 * * ? *",
      });

      // Cron input is not present before Custom… is chosen.
      expect(screen.queryByDisplayValue("0 * * * ?")).not.toBeInTheDocument();

      await userEvent.click(screen.getByDisplayValue("2 hours"));
      await userEvent.click(
        await screen.findByRole("option", { name: "Custom…" }),
      );

      // The custom cron input is now visible, populated with the default.
      expect(await screen.findByDisplayValue("0 * * * ?")).toBeInTheDocument();
    });
  });
});
