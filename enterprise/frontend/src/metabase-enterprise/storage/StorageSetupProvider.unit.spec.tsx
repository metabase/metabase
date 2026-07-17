import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

const TestConsumer = () => {
  const { isSettingUp, openPurchaseModal } = useStorageSetup();

  return (
    <div>
      <button onClick={openPurchaseModal}>Open purchase modal</button>
      {isSettingUp && <span>setting up</span>}
    </div>
  );
};

interface SetupOpts {
  tokenFeatures?: Partial<TokenFeatures>;
  hasAttachedDwhDatabase?: boolean;
  canUploadToDwh?: boolean;
  isHosted?: boolean;
  isAdmin?: boolean;
  addOns?: ICloudAddOnProduct[];
  purchaseStatus?: number;
}

const setup = ({
  tokenFeatures = {},
  hasAttachedDwhDatabase = false,
  canUploadToDwh = true,
  isHosted = true,
  isAdmin = true,
  addOns = [mockStorageCloudAddOn],
  purchaseStatus = 200,
}: SetupOpts = {}) => {
  const settingValues = {
    "is-hosted?": isHosted,
    "token-features": createMockTokenFeatures(tokenFeatures),
    "uploads-settings": {
      db_id: hasAttachedDwhDatabase && canUploadToDwh ? 1 : null,
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
  // Storage is "ready" once the provisioned Cloud Storage database (marked
  // `is_attached_dwh`) surfaces in the databases list, so seed it when the
  // provisioned state is expected. Whether it accepts uploads is a separate,
  // possibly permanent state (`canUploadToDwh`).
  setupDatabaseListEndpoint(
    hasAttachedDwhDatabase
      ? [
          createMockDatabase({
            id: 1,
            can_upload: canUploadToDwh,
            is_attached_dwh: true,
          }),
        ]
      : [],
  );
  fetchMock.get("path:/api/ee/cloud-add-ons/addons", addOns);
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", purchaseStatus);
  fetchMock.post(
    "path:/api/premium-features/token/refresh",
    createMockTokenStatus(),
  );

  renderWithProviders(
    <StorageSetupProvider>
      <TestConsumer />
      <UndoListing />
    </StorageSetupProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings(settingValues),
      }),
    },
  );
};

const openPurchaseModal = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Open purchase modal" }),
  );
  return screen.findByRole("dialog", { name: "Add Metabase Storage" });
};

const purchaseStorage = async () => {
  const modal = await openPurchaseModal();
  await userEvent.click(
    within(modal).getByRole("button", { name: "Add Metabase Storage" }),
  );
};

describe("StorageSetupProvider", () => {
  it("purchases the add-on on confirm and enters the setting-up state", async () => {
    setup();

    await purchaseStorage();

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
    setup();

    await purchaseStorage();

    expect(await screen.findByText("setting up")).toBeInTheDocument();

    // The hook polls the databases list (in addition to settings) so the
    // surrounding panels can react without a page reload.
    await waitFor(
      () => {
        expect(
          fetchMock.callHistory.calls("path:/api/database").length,
        ).toBeGreaterThan(1);
      },
      { timeout: 4000 },
    );
  });

  it("stays in the setting-up state while the attached DWH database is missing, even when the token feature flipped", async () => {
    setup({ tokenFeatures: { attached_dwh: true } });

    await purchaseStorage();

    expect(await screen.findByText("setting up")).toBeInTheDocument();
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();
  });

  it("leaves the setting-up state once the attached DWH database is available", async () => {
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
    });

    await purchaseStorage();

    // Once storage is ready the provider resets back to `initial`, so the
    // setting-up flag clears and hosting panels reveal their default view.
    await waitFor(() => {
      expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    });
    expect(
      await screen.findByText("Metabase Storage is ready"),
    ).toBeInTheDocument();
  });

  it("does not flash the setting-up state or toast on load for an instance that already has storage", async () => {
    // Existing storage admin loading the app, no purchase. The token feature is
    // synchronous while the databases list is async, so setting-up must not
    // flash on while the list is still loading.
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
    });

    // Wait for the databases list to resolve — the transition that used to flip
    // setting-up false → true → false.
    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/database")).toBe(true);
    });

    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();
  });

  it("does not enter the setting-up state on load when storage exists but uploads are disabled", async () => {
    // Storage is provisioned but its database does not accept uploads (uploads
    // disabled or pointed elsewhere) — a permanent state, not provisioning.
    // Regression for #77822: this used to read as setting-up and poll the
    // settings and databases endpoints forever on every page.
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
      canUploadToDwh: false,
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/database")).toBe(true);
    });

    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();
  });

  it("stays inert for non-admins, even in a state that reads as provisioning for admins", async () => {
    // The token feature is on and no DWH database exists — for an admin this
    // is the provisioning window with its polling. Non-admins cannot set up
    // storage, so nothing may be fetched on their behalf.
    setup({ isAdmin: false, tokenFeatures: { attached_dwh: true } });

    await screen.findByRole("button", { name: "Open purchase modal" });

    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/database")).toBe(false);
  });

  it("stays inert on self-hosted instances", async () => {
    setup({ isHosted: false, tokenFeatures: { attached_dwh: true } });

    await screen.findByRole("button", { name: "Open purchase modal" });

    expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/database")).toBe(false);
  });

  it("shows an error toast and leaves the setting-up state when the purchase fails", async () => {
    setup({ purchaseStatus: 500 });

    await purchaseStorage();

    expect(
      await screen.findByText(
        "It looks like something went wrong. Please refresh the page and try again.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    });
    expect(
      screen.queryByText("Metabase Storage is ready"),
    ).not.toBeInTheDocument();
  });

  it("leaves the setting-up state after a purchase once the DWH database appears, even if it does not accept uploads yet", async () => {
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
      canUploadToDwh: false,
    });

    await purchaseStorage();

    await waitFor(() => {
      expect(screen.queryByText("setting up")).not.toBeInTheDocument();
    });
    expect(
      await screen.findByText("Metabase Storage is ready"),
    ).toBeInTheDocument();
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
