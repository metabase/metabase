import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  getCacheStrategySelect,
  selectCacheStrategy,
} from "metabase/admin/performance/components/test-utils";
import { Route } from "metabase/router";
import type { CacheableDashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { SidebarCacheForm } from "./SidebarCacheForm";

// `Dashboard["id"]` admits transient ids; a saved dashboard's id is a number.
const dashboard: CacheableDashboard = { ...createMockDashboard(), id: 7 };

const setup = () => {
  const settings = mockSettings(
    createMockSettings({
      "token-features": createMockTokenFeatures({
        cache_granular_controls: true,
      }),
    }),
  );
  setupEnterprisePlugins();
  setupPerformanceEndpoints([]);

  const onClose = jest.fn();
  const onBack = jest.fn();

  // `useConfirmIfFormIsDirty` needs router context.
  renderWithProviders(
    <Route
      path="/"
      element={
        <SidebarCacheForm
          item={dashboard}
          model="dashboard"
          isOpen
          onClose={onClose}
          onBack={onBack}
        />
      }
    />,
    {
      storeInitialState: createMockState({ settings }),
      withRouter: true,
      initialRoute: "/",
    },
  );

  return { onClose, onBack };
};

const DISCARD_DIALOG_NAME = /Discard your changes\?/i;
const findDiscardDialog = () =>
  screen.findByRole("dialog", { name: DISCARD_DIALOG_NAME });
const queryDiscardDialog = () =>
  screen.queryByRole("dialog", { name: DISCARD_DIALOG_NAME });

describe("SidebarCacheForm", () => {
  it("closes right away when the form is not dirty", async () => {
    const { onClose } = setup();
    expect(await screen.findByTestId("cache-strategy-select")).toHaveValue(
      "Default",
    );

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(queryDiscardDialog()).not.toBeInTheDocument();
  });

  it("keeps unsaved edits and the sheet while asking whether to discard them", async () => {
    const { onClose } = setup();
    await selectCacheStrategy(/^Duration/i);

    await userEvent.keyboard("{Escape}");

    const discardDialog = await findDiscardDialog();
    expect(screen.getByText("Caching settings")).toBeInTheDocument();
    expect(getCacheStrategySelect()).toHaveValue("Duration");
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(
      within(discardDialog).getByRole("button", { name: /^Cancel$/i }),
    );

    await waitFor(() => expect(queryDiscardDialog()).not.toBeInTheDocument());
    expect(screen.getByText("Caching settings")).toBeInTheDocument();
    expect(getCacheStrategySelect()).toHaveValue("Duration");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes once the user confirms discarding the edits", async () => {
    const { onClose } = setup();
    await selectCacheStrategy(/^Duration/i);

    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(await findDiscardDialog()).getByRole("button", {
        name: "Discard",
      }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("asks before going back with unsaved edits and goes back only on Discard", async () => {
    const { onBack, onClose } = setup();
    await selectCacheStrategy(/^Duration/i);

    await userEvent.click(
      screen.getByRole("button", { name: /Caching settings/ }),
    );

    const discardDialog = await findDiscardDialog();
    expect(getCacheStrategySelect()).toHaveValue("Duration");
    expect(onBack).not.toHaveBeenCalled();

    await userEvent.click(
      within(discardDialog).getByRole("button", { name: "Discard" }),
    );

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });
});
