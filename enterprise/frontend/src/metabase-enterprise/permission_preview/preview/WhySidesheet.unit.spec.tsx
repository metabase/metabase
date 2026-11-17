import { renderWithProviders, screen } from "__support__/ui";

import { WhyContent, type WhyTarget, getWhySection } from "./WhySidesheet";

const SANDBOXED_ORDERS: WhyTarget = {
  title: "Orders",
  who: "Sandy Sales",
  subject: { label: "Table", value: "Sample Database / Orders" },
  column: "view_data",
  cell: {
    value: "sandboxed",
    group_id: 3,
    groups: [{ group_id: 3, name: "Sales", value: "sandboxed" }],
    note: null,
  },
  security: {
    kind: "sandbox",
    group_id: 3,
    group_name: "Sales",
    database_name: "Sample Database",
    table_name: "Orders",
    rows: "Filters Orders → People.State",
    filters: [
      {
        attribute: "state",
        value: "TX",
        each_member: false,
        column: "People.State",
      },
    ],
    columns: "All columns",
  },
};

describe("getWhySection", () => {
  it("shows a grid value's row security as an attribute chip, not as text", () => {
    setup({ target: SANDBOXED_ORDERS });

    expect(screen.getByText("Rows filtered by")).toBeInTheDocument();
    expect(screen.getByTitle("state TX → People.State")).toHaveTextContent(
      "stateTX→ People.State",
    );
    expect(
      screen.queryByText("Filters Orders → People.State"),
    ).not.toBeInTheDocument();
  });
});

describe("WhyContent", () => {
  it("names the person and the table a block applies to", () => {
    renderWithProviders(
      <WhyContent
        target={{
          ...SANDBOXED_ORDERS,
          cell: { ...SANDBOXED_ORDERS.cell, value: "blocked" },
          security: null,
        }}
      />,
    );

    expect(
      screen.getByText(
        "Blocked in every group Sandy Sales is in. To let Sandy Sales see this table, give one of those groups access.",
      ),
    ).toBeInTheDocument();
  });
});

type SetupOpts = { target: WhyTarget };

function setup({ target }: SetupOpts) {
  renderWithProviders(
    <>{getWhySection(target, jest.fn(), null).valueTooltip}</>,
  );
}
