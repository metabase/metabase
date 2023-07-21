import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { TypeFilter } from "metabase/nav/components/Search/SearchFilterModal/filters/TypeFilter";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { SearchModelType } from "metabase-types/api";
import { setupSearchEndpoints } from "__support__/server-mocks";
import { createMockCollectionItem, createMockSearchResult } from "metabase-types/api/mocks";

type TypeFilterSetupProps = {
  availableModels?: SearchModelType[];
  initialValue?: SearchModelType[];
  onChangeFilters?: (value: SearchModelType[]) => void;
};

const TEST_TYPES: SearchModelType[] = [
  "action",
  "app",
  "card",
  "collection",
  "dashboard",
  "database",
  "dataset",
  "table",
  "indexed-entity",
  "pulse",
  "segment",
  "metric",
];

const TEST_TYPE_SUBSET: SearchModelType[] = [
  "app",
  "dashboard",
  "collection",
  "database",
];

const TestTypeFilterComponent = ({
  initialValue = [],
  onChangeFilters = jest.fn(),
}: TypeFilterSetupProps) => {
  const [value, setValue] = useState<SearchModelType[]>(initialValue);

  const onChange = (value: SearchModelType[]) => {
    setValue(value);
    onChangeFilters(value);
  };

  return <TypeFilter value={value} onChange={onChange} />;
};

const setup = async ({
  availableModels = TEST_TYPES,
  initialValue = [],
}: TypeFilterSetupProps = {}) => {
  setupSearchEndpoints(
    availableModels.map((type, index) =>
      createMockSearchResult({ model: type, id: index + 1 }),
    ),
  );

  const onChangeFilters = jest.fn();

  renderWithProviders(
    <TestTypeFilterComponent
      onChangeFilters={onChangeFilters}
      initialValue={initialValue}
    />,
  );
  await waitFor(() =>
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument(),
  );

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

describe("TypeFilter", () => {
  it("should only display available types", async () => {
    await setup({ availableModels: TEST_TYPE_SUBSET });

    const options = getCheckboxes();

    expect(options).toHaveLength(TEST_TYPE_SUBSET.length);

    options.forEach((option, index) => {
      expect(TEST_TYPE_SUBSET).toContain(option.value);
    });
  });

  it("should allow selecting multiple types", async () => {
    const { onChangeFilters } = await setup();
    const options = getCheckboxes();

    for (const option of options) {
      userEvent.click(option);
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
});
