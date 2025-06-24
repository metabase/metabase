import { screen, within } from "__support__/ui";

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

  it("should show the error state to the admin", async () => {
    setupProUpload({ isAdmin: true });

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
});
