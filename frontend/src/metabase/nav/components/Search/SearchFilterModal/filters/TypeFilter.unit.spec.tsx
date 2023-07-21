import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { TypeFilter } from "metabase/nav/components/Search/SearchFilterModal/filters/TypeFilter";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { SearchModelType } from "metabase-types/api";
import { setupSearchEndpoints } from "__support__/server-mocks";
import { createMockCollectionItem } from "metabase-types/api/mocks";

type TypeFilterSetupProps = {
  availableModels?: SearchModelType[];
  initialValue?: SearchModelType[];
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
}: TypeFilterSetupProps) => {
  const [value, setValue] = useState<SearchModelType[]>(initialValue);
  return (
    <div>
      <TypeFilter value={value} onChange={value => setValue(value)} />
      <ul data-testid="selected-types">
        {value.map(type => (
          <li key={type}>{type}</li>
        ))}
      </ul>
    </div>
  );
};

const setup = async ({
  availableModels = TEST_TYPES,
  initialValue = [],
}: TypeFilterSetupProps = {}) => {
  setupSearchEndpoints(
    availableModels.map((type, index) =>
      createMockCollectionItem({ model: type, id: index + 1 }),
    ),
  );

  renderWithProviders(<TestTypeFilterComponent initialValue={initialValue} />);
  await waitFor(() =>
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument(),
  );
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
    await setup();
    const options = getCheckboxes();

    for (const option of options) {
      userEvent.click(option);
    }

    const selectedTypes = screen.getByTestId("selected-types");
    expect(within(selectedTypes).getAllByRole("listitem")).toHaveLength(
      TEST_TYPES.length,
    );
  });

  it("should allow de-selecting multiple types", async () => {
    await setup({ initialValue: TEST_TYPES });
    const options = getCheckboxes();

    for (const option of options) {
      userEvent.click(option);
    }

    const selectedTypes = screen.getByTestId("selected-types");
    expect(within(selectedTypes).getAllByRole("listitem")).toHaveLength(
      TEST_TYPES.length,
    );
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
