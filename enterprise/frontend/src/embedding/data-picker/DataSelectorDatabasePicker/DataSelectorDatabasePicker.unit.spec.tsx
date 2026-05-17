import { createMockEntitiesState } from "__support__/store";
import { render, screen } from "__support__/ui-minimal";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import { createMockDatabase } from "metabase-types/api/mocks";

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

  render(
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
