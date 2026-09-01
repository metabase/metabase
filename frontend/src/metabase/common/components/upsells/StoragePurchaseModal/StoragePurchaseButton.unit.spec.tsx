import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { StoragePurchaseButton } from "./StoragePurchaseButton";
import {
  StorageSetupContext,
  type StorageSetupContextValue,
} from "./storage-setup-context";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
// Reached via requireMock because the lint rule forbids importing
// `trackSchemaEvent` outside analytics files.
const { trackSchemaEvent: mockTrackSchemaEvent } = jest.requireMock<{
  trackSchemaEvent: jest.Mock;
}>("metabase/analytics");

const LOCATION = "add-data-modal-csv";
const STORE_URL = "https://store.metabase.com";

/**
 * The button is a leaf that reads nothing but `useStorageSetup`, so the context
 * is supplied directly. That keeps every case reachable — including ones the
 * real provider only reaches mid-flight, like an offer with no add-on yet.
 */
const setup = ({
  canPurchaseStorage = true,
  hasAddOn = true,
}: { canPurchaseStorage?: boolean; hasAddOn?: boolean } = {}) => {
  const openPurchaseModal = jest.fn();

  const value: StorageSetupContextValue = {
    isSettingUp: false,
    hasSetupFailed: false,
    storageAddOn: hasAddOn ? mockStorageCloudAddOn : undefined,
    isLoadingStorageAddOn: false,
    isPurchaseModalOpened: false,
    openPurchaseModal,
    canPurchaseStorage,
  };

  renderWithProviders(
    <StorageSetupContext.Provider value={value}>
      <StoragePurchaseButton location={LOCATION} />
    </StorageSetupContext.Provider>,
    {
      storeInitialState: createMockState({
        settings: mockSettings({ "store-url": STORE_URL }),
      }),
    },
  );

  return { openPurchaseModal };
};

const getUpsellEvents = (event: string) =>
  mockTrackSchemaEvent.mock.calls.filter(
    ([schema, data]) => schema === "upsell" && data?.event === event,
  );

describe("StoragePurchaseButton", () => {
  beforeEach(() => {
    mockTrackSchemaEvent.mockClear();
  });

  it("renders nothing, and reports no view, to someone who cannot buy storage", () => {
    setup({ canPurchaseStorage: false });

    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
    // An upsell nobody was shown must not be counted as viewed.
    expect(getUpsellEvents("upsell_viewed")).toHaveLength(0);
  });

  it("reports the view once, tagged with its campaign and location", () => {
    setup();

    const viewed = getUpsellEvents("upsell_viewed");
    expect(viewed).toHaveLength(1);
    expect(viewed[0][1]).toMatchObject({
      promoted_feature: "storage",
      upsell_location: LOCATION,
    });
  });

  it("opens the purchase modal, and reports the click, when the add-on is purchasable in-app", async () => {
    const { openPurchaseModal } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: /Add Metabase Storage/ }),
    );

    expect(openPurchaseModal).toHaveBeenCalledTimes(1);
    const clicked = getUpsellEvents("upsell_clicked");
    expect(clicked).toHaveLength(1);
    expect(clicked[0][1]).toMatchObject({
      promoted_feature: "storage",
      upsell_location: LOCATION,
    });
  });

  it("links out to the store, and still reports the click, without a purchasable add-on", async () => {
    const { openPurchaseModal } = setup({ hasAddOn: false });

    const link = screen.getByRole("link", { name: /Add Metabase Storage/ });
    const href = new URL(link.getAttribute("href") ?? "");
    expect(href.origin + href.pathname).toBe(`${STORE_URL}/account/storage`);
    expect(href.searchParams.get("utm_campaign")).toBe("storage");
    expect(href.searchParams.get("utm_content")).toBe(LOCATION);

    await userEvent.click(link);

    expect(getUpsellEvents("upsell_clicked")).toHaveLength(1);
    // Nothing to confirm, so no modal on top of the navigation.
    expect(openPurchaseModal).not.toHaveBeenCalled();
  });
});
