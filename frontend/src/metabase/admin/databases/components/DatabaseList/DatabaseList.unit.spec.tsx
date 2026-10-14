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

  it("shows stub databases as stubbed", async () => {
    await setup({ isStub: true, isAdmin: true });

    expect(screen.getByText("Stubbed")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("shows regular databases as active", async () => {
    await setup({ isAdmin: true });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
    expect(screen.queryByText("Stubbed")).not.toBeInTheDocument();
  });

  it("does not show restore sample database button to non-admins", async () => {
    await setup({ isSampleDb: false, isAdmin: false });

    expect(
      screen.queryByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).not.toBeInTheDocument();
  });
});
