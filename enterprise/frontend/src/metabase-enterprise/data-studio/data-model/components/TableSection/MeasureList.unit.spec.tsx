import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { EnterpriseSettings, Measure, Table } from "metabase-types/api";
import { createMockMeasure, createMockTable } from "metabase-types/api/mocks";

import { MeasureList } from "./MeasureList";

type SetupOpts = {
  measures?: Measure[];
  table?: Partial<Table>;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

function setup({ measures = [], table = {}, remoteSyncType }: SetupOpts = {}) {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    measures,
    ...table,
  });

  renderWithProviders(
    <Route path="/" component={() => <MeasureList table={mockTable} />} />,
    {
      withRouter: true,
      storeInitialState: {
        settings: mockSettings({
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
      },
    },
  );
}

describe("MeasureList", () => {
  it("should render empty state when no measures", () => {
    setup({ measures: [] });

    expect(screen.getByText("No measures yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create a measure to define a reusable aggregation for this table.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /New measure/i }),
    ).toBeInTheDocument();
  });

  it("should render measure items", () => {
    const measures = [
      createMockMeasure({
        id: 1,
        name: "Total Revenue",
        definition_description: "Sum of Total",
      }),
      createMockMeasure({ id: 2, name: "Order Count" }),
    ];
    setup({ measures });

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Sum of Total")).toBeInTheDocument();
    expect(screen.getByText("Order Count")).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Total Revenue" }),
    ).toHaveAttribute(
      "href",
      "/data-studio/data/database/1/schema/1:PUBLIC/table/1/measures/1",
    );
  });

  it("should render a 'New measure' button", () => {
    setup();
    expect(
      screen.getByRole("link", { name: /New measure/i }),
    ).toBeInTheDocument();
  });

  it("should not render 'New measure' button when remote sync is set to read-only", () => {
    setup({ remoteSyncType: "read-only" });
    expect(
      screen.queryByRole("link", { name: /New measure/i }),
    ).not.toBeInTheDocument();
  });
});
