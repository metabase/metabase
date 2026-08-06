import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
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
import { useListDatabasesQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { CSVPanel } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/Panels/CSVPanel";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  Database,
  ICloudAddOnProduct,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
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

/** Renders the real panel, so these cases cover databases list → state → view. */
interface SetupOpts {
  addOns?: ICloudAddOnProduct[];
  tokenFeatures?: Partial<TokenFeatures>;
  hasAttachedDwhDatabase?: boolean;
  /** False before the redeploy that makes storage the upload target. */
  dwhCanUpload?: boolean;
  /** Adds an ordinary database that is the instance's upload target. */
  uploadsEnabled?: boolean;
  /** Whether the current user may upload to that database. */
  canUpload?: boolean;
}

const setup = ({
  addOns = [mockStorageCloudAddOn],
  tokenFeatures = {},
  hasAttachedDwhDatabase = false,
  dwhCanUpload = true,
  uploadsEnabled = false,
  canUpload = false,
}: SetupOpts = {}) => {
  const renderPanel = (mounted: boolean) => (
    <>
      <PurchaseTrigger />
      {mounted ? <CSVPanel onCloseAddDataModal={jest.fn()} /> : null}
    </>
  );

  const settingValues = {
    "is-hosted?": true,
    "store-url": "https://store.metabase.com",
    "token-features": createMockTokenFeatures(tokenFeatures),
  };

  setupPropertiesEndpoints(createMockSettings(settingValues));
  setupDatabaseListEndpoint([
    ...(hasAttachedDwhDatabase
      ? [
          createMockDatabase({
            id: 1,
            can_upload: dwhCanUpload,
            is_attached_dwh: true,
          }),
        ]
      : []),
    ...(uploadsEnabled
      ? [
          createMockDatabase({
            id: 2,
            uploads_enabled: true,
            can_upload: canUpload,
          }),
        ]
      : []),
  ]);
  // The uploader picks a target collection as soon as it renders.
  const collections = [
    createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
  ];
  setupCollectionsEndpoints({ collections });
  setupCollectionByIdEndpoint({ collections });

  fetchMock.get("path:/api/ee/cloud-add-ons/addons", addOns);
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);
  setupTokenRefreshEndpoint();

  const { rerender } = renderWithProviders(
    <StorageSetupProvider>{renderPanel(true)}</StorageSetupProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settingValues),
      }),
    },
  );

  const remount = (mounted: boolean) =>
    rerender(
      <StorageSetupProvider>{renderPanel(mounted)}</StorageSetupProvider>,
    );

  return { remount };
};

describe("CSVPanel storage purchase", () => {
  it("offers to add storage next to the enable uploads CTA", async () => {
    setup();

    // Loader while add-on availability is fetched.
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: /Add Metabase Storage/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    expect(screen.getByText("Enable uploads")).toBeInTheDocument();
    expect(
      screen.getByText(/either enable file uploads in/),
    ).toBeInTheDocument();
    expect(screen.getByText(/, or add Metabase Storage\./)).toBeInTheDocument();
  });

  it("falls back to a store link when no purchasable add-on is available", async () => {
    setup({ addOns: [] });

    expect(await screen.findByText("Enable uploads")).toBeInTheDocument();
    // Still offered, but as a store link rather than the in-app purchase modal.
    const storeLink = await screen.findByRole("link", {
      name: /Add Metabase Storage/,
    });
    expect(storeLink).toHaveAttribute(
      "href",
      expect.stringContaining("/account/storage"),
    );
    expect(screen.getByText(/, or add Metabase Storage\./)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the setting-up view instead of the obtain-permission prompt after a purchase", async () => {
    // Mid-setup `uploads-settings` flips before the DWH accepts uploads, which
    // on its own reads as a permissions problem.
    setup({ uploadsEnabled: true, canUpload: false });

    await confirmPurchase();

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
    expect(
      screen.queryByText(/You are not permitted to upload CSV files/),
    ).not.toBeInTheDocument();
  });

  it("does not offer storage again on a reload mid-setup", async () => {
    // The token flips well before the database appears. Losing the setting-up
    // state on reload is fine; re-offering the purchase is not.
    setup({ tokenFeatures: { attached_dwh: true } });

    expect(
      await screen.findByText(
        "You don't have storage provisioned yet. Refresh this page after 1-2 minutes.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
    // No setup was started, so nothing polls.
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
  });

  it("shows the obtain-permission prompt when uploads are enabled but the user cannot upload", async () => {
    setup({ uploadsEnabled: true, canUpload: false });

    expect(
      await screen.findByText(/You are not permitted to upload CSV files/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Enable uploads")).not.toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
  });

  it("does not offer to buy storage to an admin who already has it", async () => {
    // Storage exists but uploads point elsewhere, so the CTA still shows.
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
      dwhCanUpload: false,
      uploadsEnabled: true,
      canUpload: false,
    });

    expect(
      await screen.findByText(/You are not permitted to upload CSV files/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });

  it("offers the enable-uploads CTA when uploads are off on an instance with storage", async () => {
    // Storage exists but is not the upload target, so the admin can turn uploads on.
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
      dwhCanUpload: false,
      uploadsEnabled: false,
    });

    expect(await screen.findByText("Enable uploads")).toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the uploader while a purchase is still landing", async () => {
    // Setup must not take away an upload target that already works.
    setup({ uploadsEnabled: true, canUpload: true });

    await confirmPurchase();

    expect(
      await screen.findByText("Drag and drop a file here"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
  });

  it("shows the failure view when setup exceeds its deadline", async () => {
    // Fake timers must be installed before render and drive the click, or the
    // setup deadline stays on the real clock.
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    try {
      setup();

      await confirmPurchase(user);

      expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(STORAGE_SETUP_TIMEOUT_MS);
      });

      expect(
        screen.getByText("Storage setup didn't finish"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();

      // The failure is terminal for the session — it used to collapse back to
      // the upsell, re-offering storage to someone who had just bought it.
      await act(async () => {
        jest.advanceTimersByTime(STORAGE_SETUP_TIMEOUT_MS);
      });

      expect(
        screen.getByText("Storage setup didn't finish"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Add Metabase Storage/ }),
      ).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the confirmation modal with the pricing terms", async () => {
    setup();

    const modal = await openPurchaseModal();

    expect(
      within(modal).getByText(
        /Get secure, fully managed data storage where you can upload your CSVs and sync data from Google Sheets\./,
      ),
    ).toBeInTheDocument();
    // From the add-on product: 1M included rows at $0.000002/row => $2 per 1M.
    expect(
      within(modal).getByText(
        /You will not be charged until you reach 1M stored rows, after which it's \$2\/mo\. for each additional 1M rows\./,
      ),
    ).toBeInTheDocument();
  });

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

  it("shows the in-panel setting-up view after confirming the purchase", async () => {
    setup();

    await confirmPurchase();

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/dwh-rent", {
          method: "POST",
        }),
      ).toBe(true);
    });
  });

  it("keeps the setting-up state when the panel is unmounted and remounted", async () => {
    const { remount } = setup();

    await confirmPurchase();
    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    // Closing and reopening the Add data modal. The provider lives above it.
    remount(false);
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();

    remount(true);
    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
  });

  it("refetches the uploadable-databases list once storage is provisioned", async () => {
    // The admin Uploads form reads its target list from a different databases
    // query arg (`include_only_uploadable`) than the one setup polls, so the new
    // Storage DB must be surfaced by invalidating the shared list tag, not by the
    // poll alone. The probe stands in for that form.
    const UploadableDatabasesProbe = () => {
      const { data } = useListDatabasesQuery({ include_only_uploadable: true });
      return (
        <div data-testid="uploadable-databases">
          {(data?.data ?? []).map((db) => db.name).join(",")}
        </div>
      );
    };

    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    try {
      // Storage does not exist yet; it materializes mid-setup.
      let databases: Database[] = [];
      const settingValues = {
        "is-hosted?": true,
        "store-url": "https://store.metabase.com",
        "token-features": createMockTokenFeatures({}),
      };

      setupPropertiesEndpoints(createMockSettings(settingValues));
      // Query-string-agnostic, so the polled `undefined` variant and the probe's
      // `include_only_uploadable` variant read the same evolving list.
      fetchMock.get(
        "path:/api/database",
        () => ({ data: databases, total: databases.length }),
        { name: "database-list" },
      );
      const collections = [
        createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
      ];
      setupCollectionsEndpoints({ collections });
      setupCollectionByIdEndpoint({ collections });
      fetchMock.get("path:/api/ee/cloud-add-ons/addons", [
        mockStorageCloudAddOn,
      ]);
      fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);
      setupTokenRefreshEndpoint();

      const { store } = renderWithProviders(
        <StorageSetupProvider>
          <PurchaseTrigger />
          <CSVPanel onCloseAddDataModal={jest.fn()} />
          <UploadableDatabasesProbe />
        </StorageSetupProvider>,
        {
          storeInitialState: createMockState({
            currentUser: createMockUser({ is_superuser: true }),
            settings: mockSettings(settingValues),
          }),
        },
      );
      const dispatchSpy = jest.spyOn(store, "dispatch");

      await confirmPurchase(user);
      expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
      expect(screen.getByTestId("uploadable-databases")).toHaveTextContent("");

      // Storage lands: the DWH database now appears in the list.
      databases = [
        createMockDatabase({
          id: 1,
          name: "Metabase Storage",
          is_attached_dwh: true,
          can_upload: true,
        }),
      ];

      // Polling picks up the DWH, flips setup to done, and invalidates the list
      // tag so every variant — including the probe's — refetches.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      });

      await waitFor(() => {
        expect(screen.getByTestId("uploadable-databases")).toHaveTextContent(
          "Metabase Storage",
        );
      });

      // Session properties refetch too, so the admin Uploads form picks up the
      // new upload target from `uploads-settings`.
      expect(
        invalidatedTagsInclude(dispatchSpy, ["database", "session-properties"]),
      ).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
