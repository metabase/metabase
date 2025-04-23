import { Route } from "react-router";

import {
  setupDeleteLoggerAdjustmentEndpoint,
  setupLoggerPresetsEndpoint,
  setupPostLoggerAdjustmentEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import type { LoggerPreset } from "metabase-types/api";
import { createMockLoggerPreset } from "metabase-types/api/mocks/logger";

import { LogLevelsModal } from "./LogLevelsModal";

const PRESET_A = createMockLoggerPreset({
  display_name: "Preset MySQL",
  loggers: [
    { name: "metabase.driver", level: "debug" },
    { name: "metabase.driver.mysql", level: "info" },
  ],
});

const PRESET_B = createMockLoggerPreset({
  display_name: "Preset H2",
  loggers: [
    { name: "metabase.driver", level: "debug" },
    { name: "metabase.driver.h2", level: "info" },
  ],
});

interface SetupOpts {
  error?: boolean;
  presets?: LoggerPreset[];
}

const setup = ({ error, presets = [PRESET_A, PRESET_B] }: SetupOpts = {}) => {
  setupLoggerPresetsEndpoint(presets);
  setupPostLoggerAdjustmentEndpoint();
  setupDeleteLoggerAdjustmentEndpoint();

  if (error) {
    setupLoggerPresetsEndpoint({ status: 500 }, { overwriteRoutes: true });
  }

  return renderWithProviders(
    <Route path="/">
      <ModalRoute
        path="levels"
        modal={LogLevelsModal}
        modalProps={{ enableTransition: false }}
      />
    </Route>,
    {
      initialRoute: "/levels",
      withRouter: true,
    },
  );
};

describe("LogLevelsModal", () => {
  it("should show loading state", async () => {
    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
  });

  it("should show error state", async () => {
    setup({ error: true });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
  });
});
