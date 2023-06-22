import userEvent from "@testing-library/user-event";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockNotebookStep } from "../../test-utils";
import { DataStep } from "./DataStep";

const createQueryWithFields = (columnNames: string[]) => {
  const query = createQuery();
  const findColumn = columnFinder(query, Lib.fieldableColumns(query, 0));
  const columns = columnNames.map(name => findColumn("ORDERS", name));
  return Lib.withFields(query, 0, columns);
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
    expect(getCheckbox("ID")).toBeEnabled();
    expect(getCheckbox("Tax")).toBeChecked();
    expect(getCheckbox("Tax")).toBeEnabled();
  });

  it("should render with a single column selected", () => {
    const query = createQueryWithFields(["ID"]);
    setup(createMockNotebookStep({ topLevelQuery: query }));
    userEvent.click(getIcon("chevrondown"));

    expect(getCheckbox("Select all")).not.toBeChecked();
    expect(getCheckbox("ID")).toBeChecked();
    expect(getCheckbox("ID")).toBeDisabled();
    expect(getCheckbox("Tax")).not.toBeChecked();
    expect(getCheckbox("Tax")).toBeEnabled();
  });

  it("should render with multiple columns selected", () => {
    const query = createQueryWithFields(["ID", "TOTAL"]);
    setup(createMockNotebookStep({ topLevelQuery: query }));
    userEvent.click(getIcon("chevrondown"));

    expect(getCheckbox("Select all")).not.toBeChecked();
    expect(getCheckbox("ID")).toBeChecked();
    expect(getCheckbox("ID")).toBeEnabled();
    expect(getCheckbox("Tax")).not.toBeChecked();
    expect(getCheckbox("Tax")).toBeEnabled();
    expect(getCheckbox("Total")).toBeChecked();
    expect(getCheckbox("Total")).toBeEnabled();
  });
});
