import { setupEnginesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockEngines,
} from "metabase-types/api/mocks";

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
    createMockDatabase({
      engine: "postgres",
      is_sample: isSampleDb,
      is_stub: isStub,
    }),
  ];
  const engines = createMockEngines();
  setupEnginesEndpoint(engines);

  renderWithProviders(
    <DatabaseList
      databases={databases}
      isAdmin={isAdmin}
      deletes={[]}
      engines={engines}
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

  it("marks stub databases as stubbed", async () => {
    await setup({ isStub: true, isAdmin: true });

    expect(screen.getByText("Stubbed")).toBeInTheDocument();
  });

  it("links each database to its admin page", async () => {
    await setup({ isAdmin: true });

    expect(screen.getByRole("link", { name: "Database" })).toHaveAttribute(
      "href",
      "/admin/databases/1",
    );
  });

  it("does not mark regular databases as stubbed", async () => {
    await setup({ isAdmin: true });

    expect(screen.queryByText("Stubbed")).not.toBeInTheDocument();
  });

  it("shows each database's engine and the date it was added", async () => {
    await setup({ isAdmin: true });

    expect(await screen.findByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("Added January 1, 2015")).toBeInTheDocument();
  });

  it("does not show restore sample database button to non-admins", async () => {
    await setup({ isSampleDb: false, isAdmin: false });

    expect(
      screen.queryByText(CREATE_SAMPLE_DATABASE_BUTTON_LABEL),
    ).not.toBeInTheDocument();
  });
});
