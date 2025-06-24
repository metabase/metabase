import { screen, within } from "__support__/ui";
import { BUY_STORAGE_URL } from "metabase/admin/upsells";

import { openTab } from "./helpers";
import { setupHostedInstance, setupProUpload } from "./setup";

describe("Add data modal (Starter: hosted instance without the attached DWH)", () => {
  describe("Google Sheets", () => {
    it("should render a storage upsell for an admin", async () => {
      setupHostedInstance({ isAdmin: true });

      await openTab("Google Sheets");
      expect(
        screen.getByRole("heading", { name: "Connect Google Sheets" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "To work with spreadsheets, you can add storage to your instance.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Add Metabase Storage" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Secure, fully managed by Metabase"),
      ).toBeInTheDocument();
      expect(screen.getByText("Upload CSV files")).toBeInTheDocument();
      expect(screen.getByText("Sync with Google Sheets")).toBeInTheDocument();
      const upsellLink = screen.getByRole("link", { name: "Add" });
      expect(upsellLink).toBeInTheDocument();
      expect(upsellLink).toHaveAttribute(
        "href",
        "https://store.metabase.com/account/storage?utm_source=product&utm_medium=upsell&utm_campaign=storage&utm_content=add-data-modal-sheets&source_plan=starter",
      );
    });

    it("should render a 'contact admin prompt' for non-admin", async () => {
      setupHostedInstance({ isAdmin: false });

      await openTab("Google Sheets");
      expect(
        screen.getByRole("heading", { name: "Connect Google Sheets" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Sync a spreadsheet or an entire Google Drive folder with your instance.",
        ),
      ).toBeInTheDocument();
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
    setupProUpload({ isAdmin: false });

    await openTab("Google Sheets");
    expect(
      screen.getByRole("heading", { name: "Connect Google Sheets" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sync a spreadsheet or an entire Google Drive folder with your instance.",
      ),
    ).toBeInTheDocument();
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

    await openTab("Google Sheets");
    expect(
      screen.getByRole("heading", { name: "Connect Google Sheets" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sync a spreadsheet or an entire Google Drive folder with your instance.",
      ),
    ).toBeInTheDocument();
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

    await openTab("Google Sheets");
    expect(
      await screen.findByRole("heading", { name: "Connect Google Sheets" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Sync a spreadsheet or an entire Google Drive folder with your instance.",
      ),
    ).toBeInTheDocument();
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
      status: "syncing",
    });

    await openTab("Google Sheets");
    expect(
      await screen.findByRole("heading", { name: "Connect Google Sheets" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Sync a spreadsheet or an entire Google Drive folder with your instance.",
      ),
    ).toBeInTheDocument();
    const connectButton = await screen.findByRole("button", {
      name: "Connecting...",
    });
    expect(connectButton).toBeInTheDocument();
    expect(connectButton).toBeDisabled();
  });

  it("should display error when the connection fails", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "error",
    });

    await openTab("Google Sheets");
    expect(
      await screen.findByRole("heading", { name: "Connect Google Sheets" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Sync a spreadsheet or an entire Google Drive folder with your instance.",
      ),
    ).toBeInTheDocument();
    const connectButton = await screen.findByRole("button", {
      name: "Something went wrong",
    });
    expect(connectButton).toBeInTheDocument();
    expect(connectButton).toBeDisabled();
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

  it("should alert the user when the storage is full", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "paused",
    });

    await openTab("Google Sheets");
    expect(
      await screen.findByRole("heading", { name: "Connect Google Sheets" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "To work with spreadsheets, you can add storage to your instance.",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Google Drive connected"),
    ).toBeInTheDocument();

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
    expect(upsellLink).toHaveAttribute("href", BUY_STORAGE_URL);
  });

  it("should show the active state", async () => {
    setupProUpload({
      isAdmin: true,
      enableGoogleSheets: true,
      status: "active",
    });

    await openTab("Google Sheets");
    expect(
      await screen.findByRole("heading", { name: "Import Google Sheets" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Sync a spreadsheet or an entire Google Drive folder with your instance.",
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Google Drive connected"),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "Add new" }),
    ).toBeInTheDocument();
  });
});
