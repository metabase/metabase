import userEvent from "@testing-library/user-event";

import { act, screen } from "__support__/ui";
import { setupHostedInstance } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/tests/setup";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { type Clicker, confirmPurchaseModal } from "./test-utils";
import { STORAGE_SETUP_TIMEOUT_MS } from "./use-purchase-storage-add-on";

/**
 * Both panels derive their state separately from the same provider, so a
 * purchase started on the CSV tab has to be visible on the Google Sheets tab.
 *
 * Lives here rather than with the modal's own tests to keep the enterprise
 * timeout constant and test helpers out of the OSS tree.
 */
const setup = () =>
  setupHostedInstance({
    isAdmin: true,
    addOns: [mockStorageCloudAddOn],
    enableGoogleSheets: true,
  });

const openTab = async (user: Clicker, name: RegExp) =>
  user.click(await screen.findByRole("tab", { name }));

/** Buys storage through the CSV panel's own upsell button, not a test harness. */
const buyStorageFromCsvPanel = async (user: Clicker) => {
  await user.click(
    await screen.findByRole("button", { name: /Add Metabase Storage/ }),
  );
  await confirmPurchaseModal(user);
};

describe("Add data modal (storage bought from one tab, seen from the other)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the setting-up view on the Sheets tab after buying from the CSV tab", async () => {
    setup();

    await openTab(userEvent, /CSV$/);
    await buyStorageFromCsvPanel(userEvent);
    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    await openTab(userEvent, /Google Sheets$/);

    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the failure view on the Sheets tab once setup passes its deadline", async () => {
    // Fake timers must be installed before render and drive the click, or the
    // setup deadline stays on the real clock.
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    setup();

    await openTab(user, /CSV$/);
    await buyStorageFromCsvPanel(user);
    expect(await screen.findByText("Setting up storage")).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(STORAGE_SETUP_TIMEOUT_MS);
    });

    await openTab(user, /Google Sheets$/);

    expect(
      await screen.findByText("Storage setup didn't finish"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
  });
});
