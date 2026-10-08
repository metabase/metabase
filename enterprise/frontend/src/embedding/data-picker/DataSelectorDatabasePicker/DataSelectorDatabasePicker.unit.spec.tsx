import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getEntityLookups } from "metabase/querying/common/components/DataSelector";
import { checkNotNull } from "metabase/utils/types";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DataSelectorDatabasePicker } from "./DataSelectorDatabasePicker";

const TEST_DATABASE = createMockDatabase();

const setup = () => {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [TEST_DATABASE],
    }),
  });
  const lookups = getEntityLookups(state);
  const database = checkNotNull(lookups.database(TEST_DATABASE.id));

  renderWithProviders(
    <DataSelectorDatabasePicker
      databases={[database]}
      onChangeDatabase={jest.fn()}
    />,
  );
};

describe("DataSelectorDatabasePicker", () => {
  it("displays database name", () => {
    setup();
    expect(screen.getByText(TEST_DATABASE.name)).toBeInTheDocument();
  });
});
