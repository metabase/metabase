import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import {
  PRODUCTS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { FieldList } from "./FieldList";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(state);

const setup = () => {
  const table = checkNotNull(metadata.table(PRODUCTS_ID));
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
