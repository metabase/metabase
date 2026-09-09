import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FieldList } from "./FieldList";

const database = createSampleDatabase();

const state = createMockState({
  entities: createMockEntitiesState({ databases: [database] }),
});

const setup = () => {
  const table = checkNotNull(
    database.tables?.find(({ id }) => id === PRODUCTS_ID),
  );
  const fields = [checkNotNull(table.fields)[0]];
  renderWithProviders(
    <FieldList table={table} fields={fields} onFieldClick={jest.fn()} />,
    { storeInitialState: state },
  );
};

describe("FieldList", () => {
  it("should render the info icon", () => {
    setup();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });
});
