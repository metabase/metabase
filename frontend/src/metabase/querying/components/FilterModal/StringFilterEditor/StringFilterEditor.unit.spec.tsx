import userEvent from "@testing-library/user-event";
import { PRODUCT_CATEGORY_VALUES } from "metabase-types/api/mocks/presets";
import { renderWithProviders, screen } from "__support__/ui";
import { setupFieldValuesEndpoints } from "__support__/server-mocks";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { StringFilterEditor } from "./StringFilterEditor";

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
}

function setup({ query, stageIndex, column, filter }: SetupOpts) {
  const onChange = jest.fn();
  const onInput = jest.fn();

  setupFieldValuesEndpoints(PRODUCT_CATEGORY_VALUES);

  renderWithProviders(
    <StringFilterEditor
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isSearching={false}
      onChange={onChange}
      onInput={onInput}
    />,
  );

  const getNextFilter = () => {
    const [nextFilter] = onChange.mock.lastCall;
    return nextFilter;
  };

  return { onChange, onInput, getNextFilter };
}

describe("StringFilterEditor", () => {
  const query = createQuery();
  const stageIndex = 0;
  const availableColumns = Lib.filterableColumns(query, stageIndex);
  const findColumn = columnFinder(query, availableColumns);
  const column = findColumn("PRODUCTS", "CATEGORY");

  it("should allow to pick list values", async () => {
    const { getNextFilter } = setup({
      query,
      stageIndex,
      column,
    });

    userEvent.click(await screen.findByText("Gadget"));

    const filter = getNextFilter();
    expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
      displayName: "Category is Gadget",
    });
  });

  it("should add a filter with one value", async () => {
    const { getNextFilter } = setup({
      query,
      stageIndex,
      column,
    });

    userEvent.click(screen.getByText("is"));
    userEvent.click(await screen.findByText("Starts with"));
    userEvent.type(screen.getByPlaceholderText("Enter some text"), "Ga");
    userEvent.click(document.body);

    const filter = getNextFilter();
    expect(Lib.displayInfo(query, stageIndex, filter)).toMatchObject({
      displayName: "Category starts with Ga",
    });
  });
});
