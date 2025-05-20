import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import DataSelectorDatabasePicker from "./DataSelectorDatabasePicker";

const TEST_DATABASE = createMockDatabase();

const setup = () => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [TEST_DATABASE],
    }),
  });
  const metadata = getMetadata(state);
  const database = checkNotNull(metadata.database(TEST_DATABASE.id));

  renderWithProviders(
    <DataSelectorDatabasePicker
      databases={[database]}
      onChangeDatabase={jest.fn()}
      onChangeSchema={jest.fn()}
    />,
  );
};

describe("DataSelectorDatabasePicker", () => {
  it("displays database name", () => {
    setup();
    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
  });
});
