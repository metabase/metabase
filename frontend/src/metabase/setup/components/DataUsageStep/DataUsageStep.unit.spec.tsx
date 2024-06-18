import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { SetupStep } from "metabase/setup/types";
import {
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import { DataUsageStep } from "./DataUsageStep";

interface SetupOpts {
  step?: SetupStep;
}

const TRACKING_PATH = "path:/api/setting/anon-tracking-enabled";

const setup = ({ step = "data_usage" }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
    }),
  });

  fetchMock.get("path:/api/setting", 200);
  fetchMock.get("path:/api/session/properties", 200);

  renderWithProviders(<DataUsageStep stepLabel={0} />, {
    storeInitialState: state,
  });
};

describe("DataUsageStep", () => {
  it("should render in inactive state", () => {
    setup({ step: "user_info" });

    expect(screen.getByText("Usage data preferences")).toBeInTheDocument();
  });

  it("should allow toggling tracking permissions", async () => {
    setup({ step: "data_usage" });
    fetchMock.put(TRACKING_PATH, 204);

    const toggle = screen.getByRole("switch", { name: /Allow Metabase/ });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(fetchMock.called(TRACKING_PATH, { method: "PUT" })).toBeTruthy();
    });

    expect(toggle).not.toBeChecked();
  });

  it("should show an error message on submit", async () => {
    setup({ step: "data_usage" });
    fetchMock.put(TRACKING_PATH, 400);

    const toggle = screen.getByRole("switch", { name: /Allow Metabase/ });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(fetchMock.called(TRACKING_PATH, { method: "PUT" })).toBeTruthy();
    });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });
});
