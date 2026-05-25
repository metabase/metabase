import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MetricCachingModal } from "./MetricCachingModal";

interface SetupOpts {
  cardId?: number;
  cardName?: string;
}

function setup({ cardId = 19, cardName = "Number of Orders" }: SetupOpts = {}) {
  const settings = mockSettings(
    createMockSettings({
      "token-features": createMockTokenFeatures({
        cache_granular_controls: true,
      }),
    }),
  );

  setupEnterprisePlugins();
  setupPerformanceEndpoints([]);
  fetchMock.post("glob:*/api/cache/invalidate*", {});

  const onClose = jest.fn();
  const storeInitialState = createMockState({ settings });

  // Wrap in a <Route> so the `useConfirmIfFormIsDirty` hook (which calls
  // `useRouter`) finds a matched route on `/`.
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <MetricCachingModal
          cardId={cardId}
          cardName={cardName}
          onClose={onClose}
        />
      )}
    />,
    { storeInitialState, withRouter: true, initialRoute: "/" },
  );

  return { cardId, cardName, onClose };
}

describe("MetricCachingModal", () => {
  it("renders the five strategy radio options with Default preselected", async () => {
    setup();

    expect(
      await screen.findByRole("radio", { name: /^Default$/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /^Duration$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /^Schedule$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /^Adaptive$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Don.t cache/i }),
    ).toBeInTheDocument();
  });

  it("persists the selected strategy and closes the modal on Save", async () => {
    const { onClose } = setup();

    await userEvent.click(
      await screen.findByRole("radio", { name: /^Duration$/i }),
    );
    await userEvent.click(screen.getByTestId("strategy-form-submit-button"));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/cache", { method: "PUT" }),
      ).toBe(true);
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes the modal on Cancel without writing to the cache config", async () => {
    const { onClose } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );

    expect(onClose).toHaveBeenCalled();
    expect(
      fetchMock.callHistory.called("path:/api/cache", { method: "PUT" }),
    ).toBe(false);
  });

  it("prompts before discarding when the close button is pressed with a dirty form", async () => {
    const { onClose } = setup();

    // Dirty the form
    await userEvent.click(
      await screen.findByRole("radio", { name: /^Duration$/i }),
    );

    // Trigger Modal.onClose (the X button), not Cancel/reset
    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(
      await screen.findByRole("heading", { name: /Discard your changes\?/i }),
    ).toBeInTheDocument();
    // onClose isn't called until the user confirms the discard
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the Clear cache button labelled for the metric", async () => {
    setup();

    expect(
      await screen.findByText("Clear cache for this metric"),
    ).toBeInTheDocument();
  });
});
