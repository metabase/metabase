import { render, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseList } from "./DatabaseList";

const CREATE_SAMPLE_DATABASE_BUTTON_LABEL = "Bring the sample database back";

interface SetupOpts {
  isSampleDb: boolean;
  isAdmin: boolean;
}

async function setup({ isSampleDb, isAdmin }: SetupOpts) {
  const databases = [createMockDatabase({ is_sample: isSampleDb })];

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

  it("does not show restore sample database button to non-admins", async () => {
    await setup({ isSampleDb: false, isAdmin: false });

    expect(
      screen.queryByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).not.toBeInTheDocument();
  });
});
