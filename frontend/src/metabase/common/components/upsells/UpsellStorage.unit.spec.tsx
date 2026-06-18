import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { ICloudAddOnProduct, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { UpsellStorage } from "./UpsellStorage";

interface SetupOpts {
  isAdmin?: boolean;
  isHosted?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  addOns?: Partial<ICloudAddOnProduct>[];
}

const setup = ({
  isAdmin = true,
  isHosted = true,
  tokenFeatures = {},
  addOns = [mockStorageCloudAddOn],
}: SetupOpts = {}) => {
  const settingValues = {
    "is-hosted?": isHosted,
    "store-url": "https://store.metabase.com",
    "token-features": createMockTokenFeatures(tokenFeatures),
  };

  setupPropertiesEndpoints(createMockSettings(settingValues));
  setupDatabaseListEndpoint([]);
  fetchMock.get("path:/api/ee/cloud-add-ons/addons", addOns);
  fetchMock.post("path:/api/ee/cloud-add-ons/dwh-rent", 200);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings(settingValues),
  });

  renderWithProviders(<UpsellStorage location="add-data-modal-csv" />, {
    storeInitialState: state,
  });
};

describe("UpsellStorage", () => {
  it("renders nothing when the instance is not hosted", () => {
    setup({ isHosted: false });
    expect(screen.queryByTestId("upsell-banner")).not.toBeInTheDocument();
  });

  it("renders nothing when storage is already attached", () => {
    setup({ tokenFeatures: { attached_dwh: true } });
    expect(screen.queryByTestId("upsell-banner")).not.toBeInTheDocument();
  });

  it("shows a loader while the add-on availability is being fetched", () => {
    setup();
    expect(screen.getByTestId("upsell-storage-loader")).toBeInTheDocument();
    expect(screen.queryByTestId("upsell-banner")).not.toBeInTheDocument();
  });

  it("opens the in-app purchase popup when the storage add-on is purchasable", async () => {
    setup();

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));

    expect(
      await screen.findByText(
        "Get a fully managed data warehouse. Upload CSV files and sync with Google Sheets.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /You will not be charged until you reach 1M stored rows/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add storage" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/cloud-add-ons/dwh-rent", {
          method: "POST",
        }),
      ).toBe(true);
    });
  });

  it("falls back to the external store link when no purchasable add-on is available", async () => {
    setup({ addOns: [] });

    const addLink = await screen.findByRole("link", { name: "Add" });
    expect(addLink).toHaveAttribute(
      "href",
      expect.stringContaining("/account/storage"),
    );
  });
});
