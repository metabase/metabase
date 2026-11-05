import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabaseListEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DataSourceSelectors } from "./DataSourceSelectors";

const SAMPLE_DATABASE = createSampleDatabase();
const OTHER_DATABASE = createMockDatabase({ id: 2, name: "QA Postgres12" });

interface SetupOpts {
  databases: Database[];
}

function setup({ databases }: SetupOpts) {
  setupDatabaseListEndpoint(databases);
  setupSearchEndpoints([]);

  const metadata = createMockMetadata({ databases });
  const question = Question.create({
    metadata,
    dataset_query: createMockNativeDatasetQuery({
      database: null,
      native: { query: "" },
    }),
  });

  renderWithProviders(
    <DataSourceSelectors
      isNativeEditorOpen
      query={checkNotNull(question.legacyNativeQuery())}
      question={question}
      setDatabaseId={jest.fn()}
      setTableId={jest.fn()}
    />,
  );
}

describe("DataSourceSelectors", () => {
  it("should open the database picker when there are multiple databases and none is selected (metabase#57644)", async () => {
    setup({ databases: [SAMPLE_DATABASE, OTHER_DATABASE] });

    const popover = await screen.findByRole("dialog");
    expect(
      await within(popover).findByText("Sample Database"),
    ).toBeInTheDocument();
    expect(within(popover).getByText("QA Postgres12")).toBeInTheDocument();
  });

  it("should not open the database picker when there is only one database (metabase#57644)", async () => {
    setup({ databases: [SAMPLE_DATABASE] });

    expect(await screen.findByText("Select a database")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
