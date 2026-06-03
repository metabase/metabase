import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  getCacheStrategySelect,
  selectCacheStrategy,
} from "metabase/admin/performance/components/test-utils";
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

  // `useConfirmIfFormIsDirty` needs router context.
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
  it("renders the five strategy options with Default preselected", async () => {
    setup();

    expect(await screen.findByTestId("cache-strategy-select")).toHaveValue(
      "Default",
    );

    await userEvent.click(getCacheStrategySelect());
    expect(await screen.findAllByRole("option")).toHaveLength(5);
    expect(
      screen.getByRole("option", { name: /^Duration/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /^Schedule/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /^Adaptive/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Don.t cache/i }),
    ).toBeInTheDocument();
  });

  it("persists the selected strategy and closes the modal on Save", async () => {
    const { onClose } = setup();

    await selectCacheStrategy(/^Duration/i);
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

  it.each([
    ["close button", /close/i],
    ["Cancel button", /^Cancel$/i],
  ])(
    "prompts before discarding when the %s is pressed with a dirty form",
    async (_label, name) => {
      const { onClose } = setup();

      await selectCacheStrategy(/^Duration/i);
      await userEvent.click(screen.getByRole("button", { name }));

      expect(
        await screen.findByRole("heading", {
          name: /Discard your changes\?/i,
        }),
      ).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("re-prompts on Cancel after the discard confirmation is dismissed (form stays dirty)", async () => {
    const { onClose } = setup();

    await selectCacheStrategy(/^Duration/i);
    await userEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

    // Dismiss the discard prompt by clicking its Cancel button (not Discard).
    const discardDialog = await screen.findByRole("dialog", {
      name: /Discard your changes\?/i,
    });
    await userEvent.click(
      within(discardDialog).getByRole("button", { name: /^Cancel$/i }),
    );

    // Form should still be dirty (Duration still selected).
    expect(getCacheStrategySelect()).toHaveValue("Duration");

    // Pressing Cancel again should re-show the discard confirmation.
    await userEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(
      await screen.findByRole("heading", { name: /Discard your changes\?/i }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders the Clear cache button labelled for the metric", async () => {
    setup();

    expect(
      await screen.findByText("Clear cache for this metric"),
    ).toBeInTheDocument();
  });
});
