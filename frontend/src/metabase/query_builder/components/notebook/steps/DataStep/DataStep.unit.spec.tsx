import userEvent from "@testing-library/user-event";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockNotebookStep } from "../../test-utils";
import { DataStep } from "./DataStep";

const createQueryWithSingleColumn = (columnName: string) => {
  const query = createQuery();
  const columns = Lib.fieldableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  const foundColumn = findColumn("ORDERS", columnName);
  return Lib.withFields(query, 0, [foundColumn]);
};

const getCheckbox = (label: string) => {
  const name = new RegExp(`^((check|dash) icon )?${label}$`);
  return screen.getByRole("checkbox", { name });
};

const setup = (step = createMockNotebookStep()) => {
  const updateQuery = jest.fn();

  renderWithProviders(
    <DataStep
      step={step}
      topLevelQuery={step.topLevelQuery}
      query={step.query}
      color="brand"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  const getNextQuery = () => {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0];
  };

  return { getNextQuery };
};

describe("DataStep", () => {
  it("should render with all columns selected", () => {
    setup();
    userEvent.click(getIcon("chevrondown"));

    expect(getCheckbox("Select none")).toBeChecked();
    expect(getCheckbox("ID")).toBeChecked();
    expect(getCheckbox("Tax")).toBeChecked();
  });

  it("should render with a single column selected", () => {
    const query = createQueryWithSingleColumn("ID");
    setup(createMockNotebookStep({ topLevelQuery: query }));
    userEvent.click(getIcon("chevrondown"));

    expect(getCheckbox("Select all")).not.toBeChecked();
    expect(getCheckbox("ID")).toBeChecked();
    expect(getCheckbox("Tax")).not.toBeChecked();
  });
});
