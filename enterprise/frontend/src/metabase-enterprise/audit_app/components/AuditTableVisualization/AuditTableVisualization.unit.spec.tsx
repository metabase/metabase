import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RowValues, Series } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { AuditTableVisualization } from "./AuditTableVisualization";

const CARD_ID_COLUMN = createMockColumn({
  name: "card_id",
  display_name: "Card ID",
  base_type: "type/Integer",
});

const NAME_COLUMN = createMockColumn({
  name: "name",
  display_name: "Name",
  base_type: "type/Text",
});

const DEFAULT_ROWS: RowValues[] = [
  [1, "First question"],
  [2, "Second question"],
];

const DEFAULT_SETTINGS: ComputedVisualizationSettings = {
  "table.columns": [
    { name: "card_id", enabled: true },
    { name: "name", enabled: true },
  ],
  column: () => ({}),
};

type SetupOpts = Partial<ComponentProps<typeof AuditTableVisualization>> & {
  rows?: RowValues[];
};

const setup = ({
  rows = DEFAULT_ROWS,
  settings = DEFAULT_SETTINGS,
  ...props
}: SetupOpts = {}) => {
  const series: Series = [
    createMockSingleSeries(
      {},
      { data: { cols: [CARD_ID_COLUMN, NAME_COLUMN], rows } },
    ),
  ];

  const visualizationIsClickable = jest.fn().mockReturnValue(false);
  const onVisualizationClick = jest.fn();

  renderWithProviders(
    <AuditTableVisualization
      series={series}
      settings={settings}
      visualizationIsClickable={visualizationIsClickable}
      onVisualizationClick={onVisualizationClick}
      {...props}
    />,
  );

  return { visualizationIsClickable, onVisualizationClick };
};

describe("AuditTableVisualization", () => {
  it("renders enabled columns and cell values", () => {
    setup();

    expect(screen.getByText("Card ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("First question")).toBeInTheDocument();
    expect(screen.getByText("Second question")).toBeInTheDocument();
  });

  it("does not render disabled columns", () => {
    setup({
      settings: {
        ...DEFAULT_SETTINGS,
        "table.columns": [
          { name: "card_id", enabled: false },
          { name: "name", enabled: true },
        ],
      },
    });

    expect(screen.queryByText("Card ID")).not.toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("renders an empty state when there are no rows", () => {
    setup({ rows: [] });

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("renders row checkboxes and reports selection clicks", async () => {
    const onAllSelectClick = jest.fn();
    const onRowSelectClick = jest.fn();
    setup({
      isSelectable: true,
      rowChecked: { "1": true },
      onAllSelectClick,
      onRowSelectClick,
    });

    const [allCheckbox, firstRowCheckbox, secondRowCheckbox] =
      screen.getAllByRole("checkbox");
    expect(firstRowCheckbox).toBeChecked();
    expect(secondRowCheckbox).not.toBeChecked();

    await userEvent.click(secondRowCheckbox);
    expect(onRowSelectClick).toHaveBeenCalledWith({
      row: [2, "Second question"],
      rowIndex: 1,
    });

    await userEvent.click(allCheckbox);
    expect(onAllSelectClick).toHaveBeenCalledWith({ rows: DEFAULT_ROWS });
  });

  it("shows the sort direction on the sorted column and reports header clicks", async () => {
    const onSortingChange = jest.fn();
    setup({
      isSortable: true,
      sorting: { column: "card_id", isAscending: true },
      onSortingChange,
    });

    expect(screen.getByLabelText("chevronup icon")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Name"));
    expect(onSortingChange).toHaveBeenCalledWith({
      column: "name",
      isAscending: true,
    });

    await userEvent.click(screen.getByText("Card ID"));
    expect(onSortingChange).toHaveBeenCalledWith({
      column: "card_id",
      isAscending: false,
    });
  });

  it("reports clicks on clickable cells", async () => {
    const { visualizationIsClickable, onVisualizationClick } = setup();
    visualizationIsClickable.mockReturnValue(true);

    await userEvent.click(screen.getByText("First question"));

    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        column: NAME_COLUMN,
        value: "First question",
      }),
    );
  });
});
