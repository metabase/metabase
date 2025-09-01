import userEvent from "@testing-library/user-event";

import { fireEvent, screen, within } from "__support__/ui";

import { setup } from "./setup";

const csvFile = new File(["test,data"], "bank-statement.csv", {
  type: "text/csv",
});
const tsvFile = new File(["test,data"], "pokemon-cards.tsv", {
  type: "text/tab-separated-values",
});
const mp3File = new File(
  ["test,data"],
  "Llama Whippin' Intro - DJ Mike Llama.mp3",
  { type: "audio/mpeg" },
);

const largeFile = new File(["test,data"], "large-dataset.csv", {
  type: "text/csv",
});
Object.defineProperty(largeFile, "size", { value: 200 * 1024 * 1024 + 1 });

describe("AddDataModal", () => {
  it("should render when opened", () => {
    setup();

    expect(
      screen.getByRole("dialog", { name: "Add data" }),
    ).toBeInTheDocument();
  });

  it("should not render when not opened", () => {
    setup({ opened: false });

    expect(
      screen.queryByRole("dialog", { name: "Add data" }),
    ).not.toBeInTheDocument();
  });

  it("should have csv tab selected by default", async () => {
    setup();

    const csvTab = await screen.findByRole("tab", { name: /CSV$/ });
    expect(csvTab).toHaveAttribute("data-active", "true");
  });

  it("should allow to change tabs", async () => {
    setup();

    const databaseTab = screen.getByRole("tab", { name: /Database$/ });
    const csvTab = await screen.findByRole("tab", { name: /CSV$/ });

    expect(csvTab).toHaveAttribute("data-active", "true");
    await userEvent.click(screen.getByRole("tab", { name: /Database$/ }));
    expect(csvTab).not.toHaveAttribute("data-active");
    expect(databaseTab).toHaveAttribute("data-active", "true");
  });

  it("should maintain the tab selection state", async () => {
    setup();

    const csvTab = await screen.findByRole("tab", { name: /CSV$/ });
    expect(csvTab).toHaveAttribute("data-active", "true");

    await userEvent.click(csvTab);
    // Tab should remain selected after clicking
    expect(csvTab).toHaveAttribute("data-active", "true");
  });

  describe("database panel", () => {
    it("should show database panel for admin users", async () => {
      setup({ isAdmin: true });

      expect(
        await screen.findByRole("tab", { name: /CSV$/ }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("tab", { name: /Database$/ }));
      expect(
        screen.getByRole("tab", { name: /Database$/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("Manage databases")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Search databases"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "PostgreSQL" }),
      ).toBeInTheDocument();
    });

    it("should show limited view for non-admin users", async () => {
      setup({ isAdmin: false });

      expect(
        await screen.findByRole("tab", { name: /CSV$/ }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("tab", { name: /Database$/ }));
      expect(
        screen.getByRole("tab", { name: /Database$/ }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Manage databases")).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Add a database" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Start exploring in minutes. We support more than 20 data connectors.",
        ),
      ).toBeInTheDocument();

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(
        within(alert).getByText(
          /To add a new database, please contact your administrator at.*\.$/,
        ),
      ).toBeInTheDocument();
      expect(
        within(alert).getByText("admin@metabase.test"),
      ).toBeInTheDocument();
    });

    it("doesn't show admin email when there isn't one", async () => {
      setup({ isAdmin: false, adminEmail: null });

      expect(
        await screen.findByRole("tab", { name: /CSV$/ }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: /Database$/ }));

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(
        await within(alert).findByText(
          "To add a new database, please contact your administrator.",
        ),
      ).toBeInTheDocument();
      expect(
        within(alert).queryByText("admin@metabase.test"),
      ).not.toBeInTheDocument();
    });
  });

  describe("CSV panel", () => {
    it("should show CSV panel for admin users", async () => {
      setup({ isAdmin: true, uploadsEnabled: true });

      expect(await screen.findByText("Manage uploads")).toBeInTheDocument();

      expect(
        await screen.findByText("Drag and drop a file here"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(".csv or .tsv files, 50 MB max"),
      ).toBeInTheDocument();
      expect(screen.getByText("Select a file")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    });

    it("should prompt the admin to enable uploads", async () => {
      setup({ isAdmin: true, uploadsEnabled: false });

      expect(await screen.findByText("Manage uploads")).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Upload CSV files" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/^To work with CSVs, enable file uploads/),
      ).toBeInTheDocument();
      expect(screen.getByText("Enable uploads")).toBeInTheDocument();
      // Upsell banner should not show for self-hosted instances.
      expect(
        screen.queryByText("Add Metabase Storage"),
      ).not.toBeInTheDocument();
    });

    it("should prompt the admin to enable uploads with an upsell on a hosted instance", async () => {
      setup({ isAdmin: true, uploadsEnabled: false, isHosted: true });

      expect(await screen.findByText("Manage uploads")).toBeInTheDocument();
      expect(await screen.findByText("Enable uploads")).toBeInTheDocument();
      expect(
        await screen.findByText("Add Metabase Storage"),
      ).toBeInTheDocument();
    });

    it("regular user should be instructed to contact their admin in order to enable uploads", async () => {
      setup({ isAdmin: false, uploadsEnabled: false, canUpload: true });

      expect(screen.queryByText("Manage uploads")).not.toBeInTheDocument();
      expect(
        await screen.findByRole("heading", { name: "Upload CSV files" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Work with CSVs, just like with any other data source.",
        ),
      ).toBeInTheDocument();

      const alert = screen.getByRole("alert");
      expect(
        within(alert).getByText(
          /^To enable CSV file upload, please contact your administrator at/,
        ),
      ).toBeInTheDocument();
      expect(
        within(alert).getByText("admin@metabase.test"),
      ).toBeInTheDocument();
    });

    it("regular user should be instructed to contact their admin in order to gain upload permissions", async () => {
      setup({ isAdmin: false, uploadsEnabled: true, canUpload: false });

      expect(screen.queryByText("Manage uploads")).not.toBeInTheDocument();
      expect(
        await screen.findByRole("heading", { name: "Upload CSV files" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Work with CSVs, just like with any other data source.",
        ),
      ).toBeInTheDocument();

      const alert = screen.getByRole("alert");
      expect(
        within(alert).getByText(
          /^You are not permitted to upload CSV files. To get proper permissions, please contact your administrator at/,
        ),
      ).toBeInTheDocument();
      expect(
        within(alert).getByText("admin@metabase.test"),
      ).toBeInTheDocument();
    });

    it("should show CSV panel for a regular user with sufficient permissions", async () => {
      setup({ isAdmin: false, uploadsEnabled: true, canUpload: true });

      expect(screen.queryByText("Manage uploads")).not.toBeInTheDocument();

      expect(
        await screen.findByText("Drag and drop a file here"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(".csv or .tsv files, 50 MB max"),
      ).toBeInTheDocument();
      expect(screen.getByText("Select a file")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    });

    describe("file input upload", () => {
      it("should handle proper file upload", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await inputUpload(csvFile);
        await assertFileAccepted(csvFile.name);

        // It allows the same file to be uploaded again
        await inputUpload(csvFile);
        await assertFileAccepted(csvFile.name);

        // It should update with a new file
        await inputUpload(tsvFile);
        await assertFileAccepted(tsvFile.name);
      });

      /**
       * In reality, the file input picker will not let us:
       *   1. select multiple files
       *   2. choose the wrong file type
       */
      it("should error when the file is too large", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await inputUpload(largeFile);
        await expectError("Sorry, this file is too large");
      });
    });

    describe("file upload via the dropzone", () => {
      it("should handle regular file drop", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([csvFile]);
        await assertFileAccepted(csvFile.name);

        // It allows the same file to be uploaded again
        await dropUpload([csvFile]);
        await assertFileAccepted(csvFile.name);

        // It should update with a new file
        await dropUpload([tsvFile]);
        await assertFileAccepted(tsvFile.name);
      });

      it("should error when multiple files are dropped at once", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([csvFile, tsvFile]);
        await expectError("Please upload files individually");
      });

      it("should error when wrong file type is dropped", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([mp3File]);
        await expectError("Sorry, this file type is not supported");
      });

      it("should error when the file is too large", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([largeFile]);
        await expectError("Sorry, this file is too large");
      });
    });

    describe("combo upload (input -> drop)", () => {
      it("should update the accepted file", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await inputUpload(csvFile);
        await assertFileAccepted(csvFile.name);

        await dropUpload([tsvFile]);
        await assertFileAccepted(tsvFile.name);
      });

      it("should nullify the accepted file", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await inputUpload(csvFile);
        await assertFileAccepted(csvFile.name);

        await dropUpload([csvFile, tsvFile]);
        await expectError("Please upload files individually");
      });

      it("should update the error", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await inputUpload(largeFile);
        await expectError("Sorry, this file is too large");

        await dropUpload([csvFile, tsvFile]);
        await expectError("Please upload files individually");
      });

      it("should nullify the error", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await inputUpload(largeFile);
        await expectError("Sorry, this file is too large");

        await dropUpload([tsvFile]);
        await assertFileAccepted(tsvFile.name);
      });
    });

    describe("combo upload (drop -> input)", () => {
      it("should update the accepted file", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([tsvFile]);
        await assertFileAccepted(tsvFile.name);

        await inputUpload(csvFile);
        await assertFileAccepted(csvFile.name);
      });

      it("should nullify the accepted file", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([tsvFile]);
        await assertFileAccepted(tsvFile.name);

        await inputUpload(largeFile);
        await expectError("Sorry, this file is too large");
      });

      it("should update the error", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([csvFile, tsvFile]);
        await expectError("Please upload files individually");

        await inputUpload(largeFile);
        await expectError("Sorry, this file is too large");
      });

      it("should nullify the error", async () => {
        setup({ isAdmin: true, uploadsEnabled: true });

        await dropUpload([csvFile, tsvFile]);
        await expectError("Please upload files individually");

        await inputUpload(csvFile);
        await assertFileAccepted(csvFile.name);
      });
    });
  });

  describe("Google Sheets panel", () => {
    it("should not exist in OSS binaries", async () => {
      // Hosting is a premium feature
      setup({ isHosted: false });

      expect(
        screen.getByRole("tab", { name: /Database$/ }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("tab", { name: /CSV$/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: /Google Sheets$/ }),
      ).not.toBeInTheDocument();
    });
  });
});

async function inputUpload(fileorFiles: File | File[]) {
  const input: HTMLInputElement = await screen.findByTestId(
    "add-data-modal-upload-csv-input",
  );
  expect(input).toBeInTheDocument();
  await userEvent.upload(input, fileorFiles);
}

async function dropUpload(files: File[]) {
  const dropzone = await screen.findByTestId("add-data-modal-csv-dropzone");
  expect(dropzone).toBeInTheDocument();
  const dropEvent = {
    dataTransfer: {
      files,
      types: ["Files"],
    },
  };
  fireEvent.drop(dropzone, dropEvent);
}

async function expectError(error: string) {
  expect(await screen.findByText(error)).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Upload" })).toBeDisabled();
}

async function assertFileAccepted(name: string) {
  expect(await screen.findByText(name)).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Upload" })).toBeEnabled();
}
