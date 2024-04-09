import { render, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";

import DatabaseList from "./DatabaseList";

const CREATE_SAMPLE_DATABASE_BUTTON_LABEL = "Bring the sample database back";

async function setup({ hasSampleDatabase, isAdmin } = {}) {
  const databases = [createMockDatabase()];

  render(
    <DatabaseList
      databases={databases}
      hasSampleDatabase={hasSampleDatabase}
      isAdmin={isAdmin}
      deletes={[]}
    />,
  );
}

describe("DatabaseListApp", () => {
  it("shows the restore sample database button to admins when there is no sample database", async () => {
    await setup({ hasSampleDatabase: false, isAdmin: true });

    expect(
      screen.getByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).toBeInTheDocument();
  });

  it("does not show the restore sample database button to admins when the sample database exists", async () => {
    await setup({ hasSampleDatabase: true, isAdmin: true });

    expect(
      screen.queryByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).not.toBeInTheDocument();
  });

  it("does not show restore sample database button to non-admins", async () => {
    await setup({ hasSampleDatabase: false, isAdmin: false });

    expect(
      screen.queryByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).not.toBeInTheDocument();
  });
});
