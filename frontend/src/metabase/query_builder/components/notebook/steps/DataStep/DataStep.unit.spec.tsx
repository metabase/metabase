import userEvent from "@testing-library/user-event";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
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

const setup = async (step = createMockNotebookStep()) => {
  const updateQuery = jest.fn();
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);

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

  await screen.findByText("Orders");

  return { getNextQuery };
};

describe("DataStep", () => {
  it("should render with all columns selected", async () => {
    await setup();
    userEvent.click(getIcon("chevrondown"));

    expect(screen.getByLabelText("Select none")).toBeChecked();
    expect(screen.getByLabelText("ID")).toBeChecked();
    expect(screen.getByLabelText("ID")).toBeEnabled();
    expect(screen.getByLabelText("Tax")).toBeChecked();
    expect(screen.getByLabelText("Tax")).toBeEnabled();
  });

  it("should render with a single column selected", async () => {
    const query = createQueryWithFields(["ID"]);
    await setup(createMockNotebookStep({ topLevelQuery: query }));
    userEvent.click(getIcon("chevrondown"));

    expect(screen.getByLabelText("Select all")).not.toBeChecked();
    expect(screen.getByLabelText("ID")).toBeChecked();
    expect(screen.getByLabelText("ID")).toBeDisabled();
    expect(screen.getByLabelText("Tax")).not.toBeChecked();
    expect(screen.getByLabelText("Tax")).toBeEnabled();
  });

  it("should render with multiple columns selected", async () => {
    const query = createQueryWithFields(["ID", "TOTAL"]);
    await setup(createMockNotebookStep({ topLevelQuery: query }));
    userEvent.click(getIcon("chevrondown"));

    expect(screen.getByLabelText("Select all")).not.toBeChecked();
    expect(screen.getByLabelText("ID")).toBeChecked();
    expect(screen.getByLabelText("ID")).toBeEnabled();
    expect(screen.getByLabelText("Tax")).not.toBeChecked();
    expect(screen.getByLabelText("Tax")).toBeEnabled();
    expect(screen.getByLabelText("Total")).toBeChecked();
    expect(screen.getByLabelText("Total")).toBeEnabled();
  });
});
