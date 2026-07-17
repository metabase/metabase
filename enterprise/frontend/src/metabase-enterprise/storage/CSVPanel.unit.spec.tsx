import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { CSVPanel } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/Panels/CSVPanel";
import { createMockState } from "metabase/redux/store/mocks";
import type { ICloudAddOnProduct, TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { StorageSetupProvider } from "./StorageSetupProvider";

interface PanelProps {
  canUpload: boolean;
  canManageUploads: boolean;
  uploadsEnabled: boolean;
}

const DEFAULT_PANEL_PROPS: PanelProps = {
  canUpload: false,
  canManageUploads: true,
  uploadsEnabled: false,
};

interface SetupOpts {
  addOns?: ICloudAddOnProduct[];
  tokenFeatures?: Partial<TokenFeatures>;
  hasAttachedDwhDatabase?: boolean;
  canUploadToDwh?: boolean;
  panelProps?: Partial<PanelProps>;
}

const setup = ({
  addOns = [mockStorageCloudAddOn],
  tokenFeatures = {},
  hasAttachedDwhDatabase = false,
  canUploadToDwh = true,
  panelProps,
}: SetupOpts = {}) => {
  const props = { ...DEFAULT_PANEL_PROPS, ...panelProps };
  const renderPanel = (mounted: boolean) =>
    mounted ? <CSVPanel {...props} onCloseAddDataModal={jest.fn()} /> : null;

  const settingValues = {
    "is-hosted?": true,
    "store-url": "https://store.metabase.com",
    "token-features": createMockTokenFeatures(tokenFeatures),
  };

  setupPropertiesEndpoints(createMockSettings(settingValues));
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
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);
  fetchMock.post("path:/api/premium-features/token/refresh", {});

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

const openPurchaseModal = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: /Add Metabase Storage/ }),
  );

  return await screen.findByRole("dialog", { name: "Add Metabase Storage" });
};

const confirmPurchase = async () => {
  const modal = await openPurchaseModal();
  await userEvent.click(
    within(modal).getByRole("button", { name: "Add Metabase Storage" }),
  );
};

describe("CSVPanel storage purchase", () => {
  it("offers to add storage next to the enable uploads CTA", async () => {
    setup();

    // A plain loader shows while the add-on availability is being fetched.
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
    // Storage is still offered, but as a link out to the store rather than the
    // in-app purchase modal.
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

  it("shows the setting-up view instead of the obtain-permission prompt while provisioning", async () => {
    // Mid-provisioning the token feature and `uploads-settings` flip before the
    // DWH database accepts uploads, so `uploadsEnabled` is true while
    // `canUpload` is still false. The purchasing admin must see the setup view,
    // not a "contact your administrator" prompt.
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: false,
      panelProps: { uploadsEnabled: true, canUpload: false },
    });

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
    expect(
      screen.queryByText(/You are not permitted to upload CSV files/),
    ).not.toBeInTheDocument();
  });

  it("shows the enable-uploads CTA without the storage upsell when storage exists but uploads are disabled", async () => {
    // Storage is provisioned, but uploads are turned off on its database — a
    // steady state an admin resolves in the Uploads settings. Regression for
    // #77822: this used to render the setting-up spinner (with endless
    // polling), and offering to buy storage again would be wrong.
    setup({
      tokenFeatures: { attached_dwh: true },
      hasAttachedDwhDatabase: true,
      canUploadToDwh: false,
    });

    // The upsell-free subtitle only renders once the databases list has
    // resolved and the panel knows storage is already provisioned.
    expect(
      await screen.findByText(
        /To work with CSVs, enable file uploads in your database\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Enable uploads")).toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the obtain-permission prompt when uploads are enabled but the user cannot upload", async () => {
    // Uploads are configured, but this user lacks upload permission and no
    // provisioning is underway, so they get pointed at their administrator.
    setup({
      panelProps: { uploadsEnabled: true, canUpload: false },
    });

    expect(
      await screen.findByText(/You are not permitted to upload CSV files/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Enable uploads")).not.toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
  });

  it("shows the confirmation modal with the pricing terms", async () => {
    setup();

    const modal = await openPurchaseModal();

    expect(
      within(modal).getByText(
        /Get secure, fully managed data storage where you can upload your CSVs and sync data from Google Sheets\./,
      ),
    ).toBeInTheDocument();
    // Numbers are derived from the add-on product: 1M included rows,
    // $0.000002 per row => $2 per additional 1M rows.
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

    // Simulate closing the Add data modal (panel content unmounts) and reopening
    // it. The provider lives above the modal, so the setting-up state survives.
    remount(false);
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();

    remount(true);
    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
  });
});
