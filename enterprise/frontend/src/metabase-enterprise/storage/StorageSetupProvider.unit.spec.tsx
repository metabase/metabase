import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
  setupTokenRefreshEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Api } from "metabase/api";
import { listTag } from "metabase/api/tags";
import { UndoListing } from "metabase/common/components/UndoListing";
import { useStorageSetup } from "metabase/common/components/upsells/StoragePurchaseModal";
import { createMockState } from "metabase/redux/store/mocks";
import type { ICloudAddOnProduct, TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { StorageSetupProvider } from "./StorageSetupProvider";
import {
  PurchaseTrigger,
  confirmPurchase,
  invalidatedTagsInclude,
  openPurchaseModal,
} from "./test-utils";
import {
  POLL_INTERVAL_MS,
  STORAGE_SETUP_TIMEOUT_MS,
} from "./use-purchase-storage-add-on";

const TestConsumer = () => {
  const { isSettingUp, hasSetupFailed } = useStorageSetup();

  return (
    <div>
      <PurchaseTrigger />
      {isSettingUp && <span>setting up</span>}
      {hasSetupFailed && <span>setup failed</span>}
    </div>
  );
};

interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasAttachedDwhDatabase?: boolean;
  isHosted?: boolean;
  addOns?: ICloudAddOnProduct[];
  /** Mirrors `enabled={opened}` from the Add data modal. */
  enabled?: boolean;
  /** The purchase request itself fails, as opposed to provisioning never landing. */
  purchaseFails?: boolean;
}

const setup = ({
  tokenFeatures = {},
  hasAttachedDwhDatabase = false,
  isHosted = true,
  addOns = [mockStorageCloudAddOn],
  enabled = true,
  purchaseFails = false,
}: SetupOpts = {}) => {
  const settingValues = {
    "is-hosted?": isHosted,
    "token-features": createMockTokenFeatures(tokenFeatures),
    "uploads-settings": {
      db_id: hasAttachedDwhDatabase ? 1 : null,
      schema_name: null,
      table_prefix: null,
    },
  };

  setupPropertiesEndpoints(
    createMockSettings({
      ...settingValues,
      "token-status": createMockTokenStatus({
        features: tokenFeatures.attached_dwh ? ["attached-dwh"] : [],
      }),
    }),
  );
  // Setup finishes once the `is_attached_dwh` database surfaces here. Whether it
  // accepts uploads is a separate question that must not feed back into setup.
  setupDatabaseListEndpoint(
    hasAttachedDwhDatabase
      ? [
          createMockDatabase({
            id: 1,
            is_attached_dwh: true,
          }),
        ]
      : [],
  );
  fetchMock.get("path:/api/ee/cloud-add-ons/addons", addOns);
  fetchMock.post(
    "path:/api/ee/cloud-add-ons/dwh-rent",
    purchaseFails ? 500 : 200,
  );
  setupTokenRefreshEndpoint();

  // The consumer stands in for the modal contents, which unmount on close.
  // `UndoListing` is a sibling so toasts still render while it is gone.
  const renderTree = (opts: {
    isConsumerMounted: boolean;
    enabled: boolean;
  }) => (
    <StorageSetupProvider enabled={opts.enabled}>
      {opts.isConsumerMounted ? <TestConsumer /> : null}
      <UndoListing />
    </StorageSetupProvider>
  );

  const { rerender, store } = renderWithProviders(
    renderTree({ isConsumerMounted: true, enabled }),
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settingValues),
      }),
    },
  );

  /** Stands in for the Add data modal closing (`enabled={opened}`) and reopening. */
  const remount = ({
    isConsumerMounted = true,
    enabled: nextEnabled = enabled,
  }: { isConsumerMounted?: boolean; enabled?: boolean } = {}) =>
    rerender(renderTree({ isConsumerMounted, enabled: nextEnabled }));

  return { remount, store };
};

/**
 * Setup polls every 2s and gives up after 10 minutes, so tests drive a fake
 * clock. The click that starts setup must advance it too, hence the `userEvent`.
 */
const setupFakeClock = () => {
  jest.useFakeTimers();
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
};

/** One poll tick, plus a wait for the refetch it issues to settle. */
const advanceToNextPoll = async () => {
  await act(async () => {
    jest.advanceTimersByTime(POLL_INTERVAL_MS);
  });
  // Waited on directly rather than flushed by a second tick, which would leave
  // the number of ticks it takes to land as an unspoken assumption.
  await act(async () => {
    await fetchMock.callHistory.flush(true);
  });
};

describe("StorageSetupProvider", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("purchases the add-on on confirm and enters the setting-up state", async () => {
    setup();

    await confirmPurchase();

    expect(await screen.findByText("setting up")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/dwh-rent", {
          method: "POST",
        }),
      ).toBe(true);
    });
  });

  it("reloads the databases list while setting up", async () => {
    const user = setupFakeClock();
    setup();

    await confirmPurchase(user);

    expect(await screen.findByText("setting up")).toBeInTheDocument();

    const callsBeforePoll =
      fetchMock.callHistory.calls("path:/api/database").length;
    await advanceToNextPoll();

    expect(
      fetchMock.callHistory.calls("path:/api/database").length,
    ).toBeGreaterThan(callsBeforePoll);
  });

  it("stays in the setting-up state while the attached DWH database is missing", async () => {
    setup();

    await confirmPurchase();

    expect(await screen.findByText("setting up")).toBeInTheDocument();
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();
  });

  it("leaves the setting-up state once the attached DWH database appears", async () => {
    const user = setupFakeClock();
    setup();

    await confirmPurchase(user);
    expect(await screen.findByText("setting up")).toBeInTheDocument();

    // The databases list, not the token feature, is what ends setup.
    const storage = [createMockDatabase({ id: 1, is_attached_dwh: true })];
    fetchMock.modifyRoute("database-list", {
      response: () => ({ data: storage, total: storage.length }),
    });

    await advanceToNextPoll();

    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Metabase Storage is ready"),
    ).toBeInTheDocument();
  });

  it("invalidates the databases list and session properties together when storage lands", async () => {
    // Session properties carry `uploads-settings`, which the admin Uploads form
    // reads, so it must refetch alongside the databases list.
    const user = setupFakeClock();
    const { store } = setup();
    const dispatchSpy = jest.spyOn(store, "dispatch");

    await confirmPurchase(user);
    expect(await screen.findByText("setting up")).toBeInTheDocument();

    const storage = [createMockDatabase({ id: 1, is_attached_dwh: true })];
    fetchMock.modifyRoute("database-list", {
      response: () => ({ data: storage, total: storage.length }),
    });

    await advanceToNextPoll();

    expect(
      invalidatedTagsInclude(dispatchSpy, ["database", "session-properties"]),
    ).toBe(true);
  });

  it("gives up on setup once it exceeds its deadline, and stays given up", async () => {
    // Fake timers must be installed before render or the deadline stays real.
    const user = setupFakeClock();
    setup();

    await confirmPurchase(user);
    expect(await screen.findByText("setting up")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(STORAGE_SETUP_TIMEOUT_MS);
    });

    expect(screen.getByText("setup failed")).toBeInTheDocument();
    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();

    // Terminal for the session — it used to collapse straight back to the upsell.
    await act(async () => {
      jest.advanceTimersByTime(STORAGE_SETUP_TIMEOUT_MS);
    });
    expect(screen.getByText("setup failed")).toBeInTheDocument();
  });

  it("clears a failed setup once the attached DWH database surfaces", async () => {
    const user = setupFakeClock();
    const { store } = setup();

    await confirmPurchase(user);
    expect(await screen.findByText("setting up")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(STORAGE_SETUP_TIMEOUT_MS);
    });
    expect(screen.getByText("setup failed")).toBeInTheDocument();

    // Setup timed out locally, but the DWH lands in the background. A later
    // databases-list refetch (e.g. a page refresh) must clear the stale failure.
    const storage = [createMockDatabase({ id: 1, is_attached_dwh: true })];
    fetchMock.modifyRoute("database-list", {
      response: () => ({ data: storage, total: storage.length }),
    });
    await act(async () => {
      store.dispatch(Api.util.invalidateTags([listTag("database")]));
    });
    await act(async () => {
      await fetchMock.callHistory.flush(true);
    });

    expect(screen.queryByText("setup failed")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Metabase Storage is ready"),
    ).toBeInTheDocument();
  });

  it("never enters setup on its own, however the instance looks on load", async () => {
    // A token with no matching database looks like mid-provisioning, and used to
    // be read as exactly that. Only a purchase enters setup now.
    setup({ tokenFeatures: { attached_dwh: true } });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/database")).toBe(true);
    });

    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(screen.queryByText("setup failed")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();
  });

  it("does not flash the setting-up state or toast on load for an instance that already has storage", async () => {
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/database")).toBe(true);
    });

    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();
  });

  it("recovers and lets the admin retry when the purchase request fails", async () => {
    // Unlike the deadline case, this leaves no setup running.
    setup({ purchaseFails: true });

    await confirmPurchase();

    expect(
      await screen.findByText(
        "It looks like something went wrong. Please refresh the page and try again.",
      ),
    ).toBeInTheDocument();

    // `setting-up` is entered before the request is awaited, so it flashes.
    await waitFor(() => {
      expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("setup failed")).not.toBeInTheDocument();

    // Nothing was bought, so the offer has to still be there.
    expect(await openPurchaseModal()).toBeInTheDocument();
  });

  it("finishes setup and toasts while the modal that started it is closed", async () => {
    // This is why the provider sits outside `Modal.Root`.
    const user = setupFakeClock();
    const { remount } = setup();

    await confirmPurchase(user);
    expect(await screen.findByText("setting up")).toBeInTheDocument();

    remount({ isConsumerMounted: false, enabled: false });
    expect(screen.queryByText("setting up")).not.toBeInTheDocument();

    const storage = [createMockDatabase({ id: 1, is_attached_dwh: true })];
    fetchMock.modifyRoute("database-list", {
      response: () => ({ data: storage, total: storage.length }),
    });

    await advanceToNextPoll();

    expect(
      await screen.findByText("Metabase Storage is ready"),
    ).toBeInTheDocument();
  });

  describe("enabled", () => {
    it("does not fetch the add-ons list while the hosting UI is hidden", async () => {
      // The provider is app-wide, so an ungated fetch means a Store round-trip
      // on every page load.
      setup({ enabled: false });

      await waitFor(() => {
        expect(fetchMock.callHistory.called("path:/api/database")).toBe(true);
      });
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/addons"),
      ).toBe(false);
    });

    it("keeps setup running and polling after the modal that started it closes", async () => {
      const user = setupFakeClock();
      const { remount } = setup();

      await confirmPurchase(user);
      expect(await screen.findByText("setting up")).toBeInTheDocument();

      remount({ enabled: false });

      expect(screen.getByText("setting up")).toBeInTheDocument();

      const callsBeforeClose =
        fetchMock.callHistory.calls("path:/api/database").length;
      await advanceToNextPoll();

      expect(
        fetchMock.callHistory.calls("path:/api/database").length,
      ).toBeGreaterThan(callsBeforeClose);
    });
  });

  describe("purchase confirmation modal", () => {
    it("does not purchase when the confirmation modal is cancelled", async () => {
      setup();

      const modal = await openPurchaseModal();

      await userEvent.click(
        within(modal).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Add Metabase Storage" }),
        ).not.toBeInTheDocument();
      });
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/dwh-rent"),
      ).toBe(false);
    });

    it("does not render the confirmation modal without a purchasable add-on", async () => {
      setup({ isHosted: false, addOns: [] });

      await userEvent.click(
        screen.getByRole("button", { name: "Open purchase modal" }),
      );

      expect(
        screen.queryByRole("dialog", { name: "Add Metabase Storage" }),
      ).not.toBeInTheDocument();
    });
  });
});
