import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { FileUploadErrorModal } from "./PausedModal";

const setup = async ({
  isDwh,
  errorText,
  isAdmin,
}: {
  isDwh: boolean;
  errorText: string;
  isAdmin: boolean;
}) => {
  setupDatabaseEndpoints(
    createMockDatabase({
      id: 99,
      name: "Test Db",
      is_attached_dwh: isDwh,
    }),
  );

  return renderWithProviders(
    <>
      <FileUploadErrorModal onClose={jest.fn()} fileName="manyRows.csv">
        {errorText}
      </FileUploadErrorModal>
    </>,
    {
      storeInitialState: {
        settings: createMockSettingsState(
          createMockSettings({
            "uploads-settings": {
              db_id: 99,
              schema_name: "uploads",
              table_prefix: "uploaded_",
            },
          }),
        ),
        currentUser: createMockUser({ is_superuser: isAdmin }),
      },
    },
  );
};

describe("PausedModal", () => {
  it("should show a normal upload error on a non dwh db", async () => {
    await setup({
      isDwh: false,
      errorText: "Code: 497 whoospie",
      isAdmin: true,
    });

    expect(await screen.findByText("Code: 497 whoospie")).toBeInTheDocument();
  });

  it("should show a normal upload error on a dwh db", async () => {
    await setup({
      isDwh: true,
      errorText: "This is *not* good",
      isAdmin: true,
    });

    expect(await screen.findByText("This is *not* good")).toBeInTheDocument();
  });

  it("should show a paused upload error on a dwh db", async () => {
    await setup({
      isDwh: true,
      errorText: "Code: 497 This is *not* good",
      isAdmin: true,
    });

    expect(
      await screen.findByText("Couldn't upload the file, storage is full"),
    ).toBeInTheDocument();

    // should print this to the console, but not the screen
    expect(
      screen.queryByText("Code: 497 This is *not* good"),
    ).not.toBeInTheDocument();
  });

  it("should show a store link for admins", async () => {
    await setup({
      isDwh: true,
      errorText: "Code: 497 This is *not* good",
      isAdmin: true,
    });

    expect(
      await screen.findByText("Couldn't upload the file, storage is full"),
    ).toBeInTheDocument();

    expect(screen.getByText("Add more storage")).toBeInTheDocument();
  });

  it("should not show a store link for non-admins", async () => {
    await setup({
      isDwh: true,
      errorText: "Code: 497 This is *not* good",
      isAdmin: false,
    });

    expect(
      await screen.findByText("Couldn't upload the file, storage is full"),
    ).toBeInTheDocument();

    expect(screen.queryByText("Add more storage")).not.toBeInTheDocument();
    expect(
      screen.getByText("Please contact your admin to add more storage."),
    ).toBeInTheDocument();
  });
});
