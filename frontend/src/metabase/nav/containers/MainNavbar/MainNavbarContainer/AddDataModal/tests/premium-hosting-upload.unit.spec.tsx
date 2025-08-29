import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

import { setupHostedInstance, setupProUpload } from "./setup";

describe("Add data modal (Starter: hosted instance without the attached DWH)", () => {
  describe("Google Sheets", () => {
    it("should render a storage upsell for an admin", async () => {
      setupHostedInstance({ isAdmin: true });
      await assertSheetsOpened({
        subtitle:
          "To work with spreadsheets, you can add storage to your instance.",
      });

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
      status: "syncing",
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

async function assertSheetsOpened({
  isAdmin = true,
  title = "Connect Google Sheets",
  subtitle = "Sync a spreadsheet or an entire Google Drive folder with your instance.",
}: {
  isAdmin?: boolean;
  title?: string;
  subtitle?: string;
} = {}) {
  await userEvent.click(screen.getByRole("tab", { name: /Google Sheets$/ }));

  isAdmin
    ? expect(await screen.findByText("Manage imports")).toBeInTheDocument()
    : expect(screen.queryByText("Manage imports")).not.toBeInTheDocument();

  expect(
    await screen.findByRole("heading", { name: title }),
  ).toBeInTheDocument();
  expect(await screen.findByText(subtitle)).toBeInTheDocument();
}
