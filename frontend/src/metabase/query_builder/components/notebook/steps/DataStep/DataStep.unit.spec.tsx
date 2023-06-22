import userEvent from "@testing-library/user-event";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { createMockNotebookStep } from "../../test-utils";
import { DataStep } from "./DataStep";

const setup = (step = createMockNotebookStep()) => {
  const columns = Lib.fieldableColumns(step.topLevelQuery, 0).map(column =>
    Lib.displayInfo(step.topLevelQuery, 0, column),
  );
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

  return {
    columns,
    getNextQuery,
  };
};

describe("DataStep", () => {
  it("should render with all columns selected", () => {
    const { columns } = setup();
    userEvent.click(getIcon("chevrondown"));
    expect(
      screen.getByRole("checkbox", { name: "check icon Select none" }),
    ).toBeChecked();

    columns.forEach(column => {
      expect(
        screen.getByRole("checkbox", {
          name: `check icon ${column.displayName}`,
        }),
      ).toBeChecked();
    });
  });
});
