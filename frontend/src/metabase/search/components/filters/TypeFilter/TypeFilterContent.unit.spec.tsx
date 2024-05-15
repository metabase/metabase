import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupSearchEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  within,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { EnabledSearchModel, SearchModel } from "metabase-types/api";
import {
  createMockDatabase,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import { TypeFilterContent } from "./TypeFilterContent";

const MODEL_NAME: Record<EnabledSearchModel, string> = {
  action: "Action",
  card: "Question",
  collection: "Collection",
  dashboard: "Dashboard",
  database: "Database",
  dataset: "Model",
  table: "Table",
  "indexed-entity": "Indexed record",
};

const TEST_TYPES: Array<EnabledSearchModel> = [
  "dashboard",
  "card",
  "dataset",
  "collection",
  "database",
  "table",
  "action",
];

const TEST_TYPE_SUBSET: Array<EnabledSearchModel> = [
  "dashboard",
  "collection",
  "database",
];

const TestTypeFilterComponent = ({
  initialValue = [],
  onChangeFilters,
}: {
  initialValue?: EnabledSearchModel[];
  onChangeFilters: jest.Mock;
}) => {
  const [value, setValue] = useState<EnabledSearchModel[]>(initialValue);

  const onChange = (selectedValues: EnabledSearchModel[]) => {
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
  availableModels?: EnabledSearchModel[];
  initialValue?: EnabledSearchModel[];
} = {}) => {
  setupSearchEndpoints(
    availableModels.map((type, index) =>
      createMockSearchResult({
        model: type as SearchModel,
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
  ) as HTMLInputElement[];
};
describe("TypeFilterContent", () => {
  it("should display `Type` and all type labels in order", async () => {
    await setup();

    const typeFilterElements = screen.getAllByTestId("type-filter-checkbox");
    TEST_TYPES.forEach((type, index) => {
      const checkboxWrapper = within(typeFilterElements[index]);
      const checkboxValue = checkboxWrapper
        .getByRole("checkbox")
        .getAttribute("value");
      expect(checkboxValue).toEqual(type);
      expect(
        checkboxWrapper.getByLabelText(MODEL_NAME[type]),
      ).toBeInTheDocument();
    });
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
      await userEvent.click(options[i]);
    }

    await userEvent.click(screen.getByText("Apply"));
    expect(onChangeFilters).toHaveReturnedTimes(1);
    expect(onChangeFilters).toHaveBeenLastCalledWith(TEST_TYPES);
  });

  it("should allow de-selecting multiple types", async () => {
    const { onChangeFilters } = await setup({ initialValue: TEST_TYPE_SUBSET });

    const options = getCheckboxes();
    const checkedOptions = options.filter(option => option.checked);
    for (const checkedOption of checkedOptions) {
      await userEvent.click(checkedOption);
    }
    await userEvent.click(screen.getByText("Apply"));
    expect(onChangeFilters).toHaveReturnedTimes(1);
    expect(onChangeFilters).toHaveBeenLastCalledWith([]);
  });
});
