import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  renderWithProviders,
  within,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  createMockDatabase,
  createMockSearchResult,
} from "metabase-types/api/mocks";
import { setupSearchEndpoints } from "__support__/server-mocks";
import type {
  EnabledSearchModelType,
  SearchModelType,
} from "metabase-types/api";
import { TypeFilterContent } from "./TypeFilterContent";

const MODEL_NAME: Record<EnabledSearchModelType, string> = {
  action: "Action",
  card: "Question",
  collection: "Collection",
  dashboard: "Dashboard",
  database: "Database",
  dataset: "Model",
  table: "Table",
};

const TEST_TYPES: Array<EnabledSearchModelType> = [
  "collection",
  "dashboard",
  "card",
  "database",
  "table",
  "dataset",
  "action",
];

const TEST_TYPE_SUBSET: Array<EnabledSearchModelType> = [
  "dashboard",
  "collection",
  "database",
];

const TestTypeFilterComponent = ({
  initialValue = [],
  onChangeFilters,
}: {
  initialValue?: EnabledSearchModelType[];
  onChangeFilters: jest.Mock;
}) => {
  const [value, setValue] = useState<EnabledSearchModelType[]>(initialValue);

  const onChange = (selectedValues: EnabledSearchModelType[]) => {
    onChangeFilters(selectedValues);
    setValue(selectedValues);
  };

  return <TypeFilterContent value={value} onChange={onChange} />;
};

const TEST_DATABASE = createMockDatabase({
  settings: {
    "database-enable-actions": true,
  },
});

const setup = async ({
  availableModels = TEST_TYPES,
  initialValue = [],
}: {
  availableModels?: EnabledSearchModelType[];
  initialValue?: EnabledSearchModelType[];
} = {}) => {
  setupSearchEndpoints(
    availableModels.map((type, index) =>
      createMockSearchResult({
        model: type as SearchModelType,
        id: index + 1,
        database_id: TEST_DATABASE.id,
      }),
    ),
  );

  const onChangeFilters = jest.fn();

  renderWithProviders(
    <TestTypeFilterComponent
      onChangeFilters={onChangeFilters}
      initialValue={initialValue}
    />,
  );

  await waitForLoaderToBeRemoved();

  return {
    onChangeFilters,
  };
};

const getCheckboxes = () => {
  return within(screen.getByTestId("type-filter-checkbox-group")).getAllByRole(
    "checkbox",
    {},
  ) as HTMLInputElement[];
};
describe("TypeFilterContent", () => {
  it("should display `Type` and all type labels", async () => {
    await setup();
    for (const entityType of TEST_TYPES) {
      expect(screen.getByText(MODEL_NAME[entityType])).toBeInTheDocument();
    }
  });

  it("should only display available types", async () => {
    await setup({ availableModels: TEST_TYPE_SUBSET });

    const options = getCheckboxes();

    expect(options).toHaveLength(TEST_TYPE_SUBSET.length);

    options.forEach(option => {
      expect(TEST_TYPE_SUBSET).toContain(option.value);
    });
  });

  it("should populate the filter with initial values", async () => {
    await setup({ initialValue: TEST_TYPE_SUBSET });

    const options = getCheckboxes();

    expect(options.length).toEqual(TEST_TYPES.length);

    const checkedOptions = options.filter(option => option.checked);

    expect(checkedOptions.length).toEqual(TEST_TYPE_SUBSET.length);
    for (const checkedOption of checkedOptions) {
      expect(TEST_TYPE_SUBSET).toContain(checkedOption.value);
    }
  });

  it("should allow selecting multiple types", async () => {
    const { onChangeFilters } = await setup();
    const options = getCheckboxes();

    for (let i = 0; i < options.length; i++) {
      userEvent.click(options[i]);
      expect(onChangeFilters).toHaveReturnedTimes(i + 1);
    }

    expect(onChangeFilters).toHaveReturnedTimes(TEST_TYPES.length);
    expect(onChangeFilters).toHaveBeenLastCalledWith(TEST_TYPES);
  });

  it("should allow de-selecting multiple types", async () => {
    const { onChangeFilters } = await setup({ initialValue: TEST_TYPE_SUBSET });

    const options = getCheckboxes();
    const checkedOptions = options.filter(option => option.checked);
    for (const checkedOption of checkedOptions) {
      userEvent.click(checkedOption);
    }

    expect(onChangeFilters).toHaveReturnedTimes(TEST_TYPE_SUBSET.length);
    expect(onChangeFilters).toHaveBeenLastCalledWith([]);
  });
});
