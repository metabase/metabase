import { render, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseList } from "./DatabaseList";

const CREATE_SAMPLE_DATABASE_BUTTON_LABEL = "Bring the sample database back";

interface SetupOpts {
  isSampleDb?: boolean;
  isStub?: boolean;
  isAdmin: boolean;
}

async function setup({
  isSampleDb = false,
  isStub = false,
  isAdmin,
}: SetupOpts) {
  const databases = [
    createMockDatabase({ is_sample: isSampleDb, is_stub: isStub }),
  ];

  render(
    <DatabaseList
      databases={databases}
      isAdmin={isAdmin}
      deletes={[]}
      engines={{}}
      addSampleDatabase={() => {}}
      deletionError={false}
      isAddingSampleDatabase={false}
      addSampleDatabaseError={false}
    />,
  );
}

describe("DatabaseListApp", () => {
  it("shows the restore sample database button to admins when there is no sample database", async () => {
    await setup({ isSampleDb: false, isAdmin: true });

    expect(
      screen.getByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).toBeInTheDocument();
  });

  it("does not show the restore sample database button to admins when the sample database exists", async () => {
    await setup({ isSampleDb: true, isAdmin: true });

    expect(
      screen.queryByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).not.toBeInTheDocument();
  });

  it("marks stub databases as not connected", async () => {
    await setup({ isStub: true, isAdmin: true });

    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("does not mark regular databases as not connected", async () => {
    await setup({ isAdmin: true });

    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
  });

  it("does not show restore sample database button to non-admins", async () => {
    await setup({ isSampleDb: false, isAdmin: false });

    expect(
      screen.queryByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).not.toBeInTheDocument();
  });
});
