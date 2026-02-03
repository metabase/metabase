import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDeleteLoggerAdjustmentEndpoint,
  setupLoggerPresetsEndpoint,
  setupPostLoggerAdjustmentEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { checkNotNull } from "metabase/lib/types";
import type { LoggerPreset } from "metabase-types/api";
import { createMockLoggerPreset } from "metabase-types/api/mocks/logger";

import { LogLevelsModal } from "./LogLevelsModal";

const PRESET_A = createMockLoggerPreset({
  id: String(getNextId()),
  display_name: "Preset MySQL",
  loggers: [
    { name: "metabase.driver", level: "debug" },
    { name: "metabase.driver.mysql", level: "info" },
  ],
});

const PRESET_B = createMockLoggerPreset({
  id: String(getNextId()),
  display_name: "Preset H2",
  loggers: [
    { name: "metabase.driver", level: "error" },
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
    fetchMock.modifyRoute("logger-presets", { response: { status: 500 } });
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

  it("auto-applies the first preset on load", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    // CodeMirror renders text across multiple spans, so check body text content
    await waitFor(() => {
      expect(document.body.textContent).toContain('"metabase.driver": "debug"');
    });
    expect(document.body.textContent).toContain('"metabase.driver.mysql": "info"');
  });

  it("allows to load preset", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByText("Load preset"));
    const popover = screen.getByRole("menu");
    await userEvent.click(within(popover).getByText(PRESET_B.display_name));

    // CodeMirror renders text across multiple spans, so check body text content
    await waitFor(() => {
      expect(document.body.textContent).toContain('"metabase.driver": "error"');
    });
    expect(document.body.textContent).toContain('"metabase.driver.h2": "info"');
  });

  it("allows to reset changes to defaults", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Reset to defaults/ }),
    );

    expect(
      fetchMock.callHistory.calls("path:/api/logger/adjustment", {
        method: "DELETE",
      }),
    ).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("allows to save changes", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText("Duration"));
    await userEvent.type(screen.getByPlaceholderText("Duration"), "24");
    await userEvent.click(screen.getByPlaceholderText("Unit"));
    await userEvent.click(screen.getByText("Hours"));
    await userEvent.click(screen.getByText("Load preset"));
    const popover = screen.getByRole("menu");
    await userEvent.click(within(popover).getByText(PRESET_B.display_name));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const calls = fetchMock.callHistory.calls("path:/api/logger/adjustment", {
      method: "POST",
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    const options = call.options;
    const body = await checkNotNull(options).body;

    if (typeof body !== "string") {
      throw new Error("body should be a string");
    }

    expect(JSON.parse(body)).toEqual({
      duration: 24,
      duration_unit: "hours",
      log_levels: {
        "metabase.driver": "error",
        "metabase.driver.h2": "info",
      },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // TODO: These tests hang when typing into CodeMirror with happy-dom
  it.skip("should disable save button when there is no duration", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await userEvent.clear(screen.getByPlaceholderText("Duration"));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it.skip("should disable save button when json is invalid", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    const [_durationInput, _durationUnitPicker, codeMirror] =
      screen.getAllByRole("textbox");
    await userEvent.type(codeMirror, "gibberish");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
