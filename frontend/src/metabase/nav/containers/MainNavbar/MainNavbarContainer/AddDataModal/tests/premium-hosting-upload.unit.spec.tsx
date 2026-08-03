import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import { mockStorageCloudAddOn } from "metabase-types/api/mocks/add-ons";

import { setup, setupHostedInstance, setupProUpload } from "./setup";

describe("Add data modal (Starter: hosted instance without the attached DWH)", () => {
  describe("Google Sheets", () => {
    it("should render a storage upsell for an admin when the add-on is not purchasable in-app", async () => {
      setupHostedInstance({ isAdmin: true });
      await assertSheetsOpened({
        hasStorage: false,
        subtitle:
          "To work with spreadsheets, you can add storage to your instance.",
      });

      // A single button matching the CSV tab, not the old bulleted banner. With
      // no in-app add-on it links to the store.
      const upsellLink = await screen.findByRole("link", {
        name: /Add Metabase Storage/,
      });
      const href = new URL(upsellLink.getAttribute("href") ?? "");
      expect(href.origin + href.pathname).toBe(
        "https://store.metabase.com/account/storage",
      );
      expect(href.searchParams.get("utm_campaign")).toBe("storage");
      expect(href.searchParams.get("utm_content")).toBe(
        "add-data-modal-sheets",
      );
    });

    it("should offer the purchasable storage add-on to an admin through the upsell button", async () => {
      setupHostedInstance({
        isAdmin: true,
        addOns: [mockStorageCloudAddOn],
      });
      await assertSheetsOpened({
        hasStorage: false,
        subtitle:
          "To work with spreadsheets, you can add storage to your instance.",
      });

      // Purchasable in-app: opens the confirmation instead of linking out.
      const addButton = await screen.findByRole("button", {
        name: /Add Metabase Storage/,
      });
      await userEvent.click(addButton);

      const modal = await screen.findByRole("dialog", {
        name: "Add Metabase Storage",
      });
      expect(
        within(modal).getByText(
          /You will not be charged until you reach 1M stored rows/,
        ),
      ).toBeInTheDocument();
    });

    it("should render a 'contact admin prompt' for non-admin", async () => {
      const isAdmin = false;
      setupHostedInstance({ isAdmin });
      await assertSheetsOpened({ isAdmin });

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(
        within(alert).getByText(
          /To enable Google Sheets import, please contact your administrator/,
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("Add data modal (Pro: hosted instance with the attached DWH)", () => {
  it("should render a 'contact admin prompt' for non-admin", async () => {
    const isAdmin = false;
    setupProUpload({ isAdmin });
    await assertSheetsOpened({ isAdmin });

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      within(alert).getByText(
        /To enable Google Sheets import, please contact your administrator/,
      ),
    ).toBeInTheDocument();
  });

  it("should show the general error state to the admin when the connection status is missing", async () => {
    setupProUpload({ isAdmin: true, enableGoogleSheets: false });
    await assertSheetsOpened();

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      within(alert).getByText("Couldn't sync Google Sheets"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(
        "Please check that the folder is shared with the Metabase Service Account.",
      ),
    ).toBeInTheDocument();
  });

  it("should prompt the admin to establish a connection", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "not-connected",
    });
    await assertSheetsOpened();

    const connectButton = await screen.findByRole("button", {
      name: "Connect",
    });
    expect(connectButton).toBeInTheDocument();
    expect(connectButton).toBeEnabled();
  });

  it("should show the syncing state", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "initializing",
    });
    await assertSheetsOpened();

    const connectButton = await screen.findByRole("button", {
      name: "Connecting...",
    });
    expect(connectButton).toBeInTheDocument();
    expect(connectButton).toBeEnabled();
  });

  it("should display error when the connection fails", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "error",
    });
    expect(
      await screen.findByRole("tab", { name: /CSV$/ }),
    ).toBeInTheDocument();
    await assertSheetsOpened();

    const connectButton = await screen.findByRole("button", {
      name: "Something went wrong",
    });
    expect(connectButton).toBeInTheDocument();
    expect(connectButton).toBeEnabled();
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Couldn't sync Google Sheets"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(
        "Please check that the folder is shared with the Metabase Service Account.",
      ),
    ).toBeInTheDocument();
  });

  it("should alert admin when the storage is full", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "paused",
    });
    await assertSheetsOpened({
      subtitle:
        "To work with spreadsheets, you can add storage to your instance.",
    });

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByText("Couldn't sync Google Sheets"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(
        "Metabase Storage is full. Add more storage to continue syncing.",
      ),
    ).toBeInTheDocument();

    const upsellLink = within(alert).getByRole("link", { name: "Add storage" });
    expect(upsellLink).toBeInTheDocument();
    expect(upsellLink).toHaveAttribute(
      "href",
      "https://store.metabase.com/account/storage",
    );

    const driveLink = within(alert).getByRole("link", {
      name: "Go to Google Drive",
    });
    expect(driveLink).toBeInTheDocument();
    expect(driveLink).toHaveAttribute(
      "href",
      "https://docs.google.example/your-spredsheet",
    );
  });

  it("should show the active state", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "active",
    });
    await assertSheetsOpened({ title: "Import Google Sheets" });

    expect(
      await screen.findByText("Google Drive connected"),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "Add new" }),
    ).toBeInTheDocument();
  });
});

describe("Add data modal (hosted instance whose storage never materialized)", () => {
  // The token flips at purchase but the database only appears once provisioning
  // finishes, and on a local hosted build it never does. Reading that gap as
  // "provisioning" spun and polled on every page load, so only a purchase made
  // in this tab enters setup.
  const setupTokenWithoutStorage = (opts: { uploadsEnabled: boolean }) =>
    setupProUpload({
      isAdmin: true,
      hasAttachedDwhDatabase: false,
      ...opts,
    });

  it("should tell the admin to refresh on the CSV tab rather than spin", async () => {
    setupTokenWithoutStorage({ uploadsEnabled: false });

    await userEvent.click(await screen.findByRole("tab", { name: /CSV$/ }));

    expect(
      await screen.findByText(
        "You don't have storage provisioned yet. Refresh this page after 1-2 minutes.",
      ),
    ).toBeInTheDocument();
    // "Enable uploads" would be a dead end while the DWH is still absent.
    expect(screen.queryByText("Enable uploads")).not.toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Storage setup didn't finish"),
    ).not.toBeInTheDocument();
    // Already bought, so it must be offered neither as button nor store link.
    expect(
      screen.queryByRole("button", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Add Metabase Storage/ }),
    ).not.toBeInTheDocument();
  });

  it("should keep the uploader on the CSV tab when another database accepts uploads", async () => {
    setupTokenWithoutStorage({ uploadsEnabled: true });

    await userEvent.click(await screen.findByRole("tab", { name: /CSV$/ }));

    expect(
      await screen.findByText("Drag and drop a file here"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Setting up storage")).not.toBeInTheDocument();
  });
});

/** A settings manager needs both plugins: one to gate uploads, one to be one. */
const setupSettingsManager = () =>
  setup({
    isAdmin: false,
    canManageSettings: true,
    isHosted: true,
    enterprisePlugins: ["upload_management", "application_permissions"],
    tokenFeatures: {
      hosting: true,
      attached_dwh: true,
      advanced_permissions: true,
    },
    uploadsEnabled: false,
    dwhCanUpload: false,
  });

describe("Add data modal (Pro: uploads turned off by an admin)", () => {
  it("should offer the settings manager the enable-uploads CTA", async () => {
    // Storage presence comes from the databases list, so a settings manager
    // sees it too. Uploads being off is a choice they can undo.
    setupSettingsManager();

    await userEvent.click(await screen.findByRole("tab", { name: /CSV$/ }));

    expect(await screen.findByText("Enable uploads")).toBeInTheDocument();
  });
});

async function assertSheetsOpened({
  isAdmin = true,
  hasStorage = true,
  title = "Connect Google Sheets",
  subtitle = "Sync a spreadsheet or an entire Google Drive folder with your instance.",
}: {
  isAdmin?: boolean;
  hasStorage?: boolean;
  title?: string;
  subtitle?: string;
} = {}) {
  await userEvent.click(screen.getByRole("tab", { name: /Google Sheets$/ }));

  // The imports settings link only shows for admins once storage is enabled.
  if (isAdmin && hasStorage) {
    expect(await screen.findByText("Manage imports")).toBeInTheDocument();
  } else {
    expect(screen.queryByText("Manage imports")).not.toBeInTheDocument();
  }

  expect(
    await screen.findByRole("heading", { name: title }),
  ).toBeInTheDocument();
  expect(await screen.findByText(subtitle)).toBeInTheDocument();
}
