import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { setupFieldValuesEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import {
  createSampleDatabase,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  PRODUCTS,
} from "metabase-types/api/mocks/presets";

import type { DefaultPickerProps } from "./DefaultPicker";
import { DefaultPicker } from "./DefaultPicker";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = checkNotNull(metadata.table(PRODUCTS_ID));

const makeQuery = (query = {}): StructuredQuery => {
  return ordersTable
    .question()
    .setDatasetQuery({
      type: "query",
      query: {
        "source-table": PRODUCTS_ID,
        ...query,
      },
      database: SAMPLE_DB_ID,
    })
    .legacyQuery({ useStructuredQuery: true }) as StructuredQuery;
};

const numericQuery = makeQuery({
  filter: ["=", ["field", PRODUCTS.ID, null], 42],
});
const stringQuery = makeQuery({
  filter: ["=", ["field", PRODUCTS.TITLE, null], "Ugly Shoes"],
});

async function setup(options: Partial<DefaultPickerProps> = {}) {
  const setValueSpy = jest.fn();
  const setValuesSpy = jest.fn();
  const onCommitSpy = jest.fn();

  setupFieldValuesEndpoints({
    field_id: PRODUCTS.ID,
    values: [[42], [43], [44], [56]],
    has_more_values: false,
  });

  setupFieldValuesEndpoints({
    field_id: PRODUCTS.TITLE,
    values: [["Fancy Shoes"], ["Ugly Shoes"], ["Fancy Boots"], ["Ugly Boots"]],
    has_more_values: false,
  });

  renderWithProviders(
    <DefaultPicker
      filter={stringQuery.filters()[0]}
      setValue={setValueSpy}
      setValues={setValuesSpy}
      onCommit={onCommitSpy}
      {...options}
    />,
  );

  await screen.findByTestId("default-picker-container");
  await waitForLoaderToBeRemoved();

  return { setValueSpy, setValuesSpy, onCommitSpy };
}

describe("Filters > DefaultPicker", () => {
  it("should render the default picker", () => {
    setup();

    expect(screen.getByTestId("default-picker-container")).toBeInTheDocument();
  });

  it("should render a field values widget for a numeric filter", async () => {
    await setup({ filter: numericQuery.filters()[0] });

    expect(
      await screen.findByTestId("field-values-widget"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("should render a field values widget for a string filter", async () => {
    await setup({ filter: stringQuery.filters()[0] });

    expect(
      await screen.findByTestId("field-values-widget"),
    ).toBeInTheDocument();

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Ugly Shoes")).toBeInTheDocument();
  });

  it("lists possible field values for a string filter", async () => {
    await setup({ filter: stringQuery.filters()[0] });

    expect(
      await screen.findByTestId("field-values-widget"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    const productTitles = [
      "Fancy Shoes",
      "Ugly Shoes",
      "Fancy Boots",
      "Ugly Boots",
    ];

    productTitles.forEach(productTitle => {
      expect(screen.getByText(productTitle)).toBeInTheDocument();
    });
  });

  it("should render numeric pickers for a between filter", async () => {
    const query = makeQuery({
      filter: ["between", ["field", PRODUCTS.ID, null], 42, 49],
    });
    await setup({ filter: query.filters()[0] });

    expect(screen.getAllByTestId("number-picker")).toHaveLength(2);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
    expect(screen.getByDisplayValue("49")).toBeInTheDocument();
  });

  it("should update values for a multi-value filter", async () => {
    const { setValuesSpy } = await setup({ filter: stringQuery.filters()[0] });

    const input = screen.getByRole("textbox");

    await userEvent.type(input, "Fancy Sandals");

    expect(setValuesSpy).toHaveBeenLastCalledWith([
      "Ugly Shoes",
      "Fancy Sandals",
    ]);
  });

  it("should update value for a single value filter", async () => {
    const query = makeQuery({ filter: [">", ["field", PRODUCTS.ID, null], 1] });
    const { setValueSpy } = await setup({ filter: query.filters()[0] });

    const input = screen.getByRole("textbox");

    await userEvent.type(input, "25");
    // index, value
    expect(setValueSpy).toHaveBeenLastCalledWith(0, 125);
  });

  it("should call onCommit when enter is pressed for between filters", async () => {
    const query = makeQuery({
      filter: ["between", ["field", PRODUCTS.ID, null], 42, 49],
    });
    const { onCommitSpy } = await setup({ filter: query.filters()[0] });

    expect(screen.getAllByTestId("number-picker")).toHaveLength(2);

    const input = screen.getAllByRole("textbox")[0];

    await userEvent.type(input, "1{enter}");

    expect(onCommitSpy).toHaveBeenCalled();
  });
});
