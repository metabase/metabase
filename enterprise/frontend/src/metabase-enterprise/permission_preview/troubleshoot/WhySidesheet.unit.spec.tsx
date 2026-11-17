import { renderWithProviders, screen } from "__support__/ui";

import { WhyContent, type WhyTarget } from "./WhySidesheet";

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

describe("WhyContent", () => {
  it("says a block is in every group, with how to lift it, and marks no group as the one that applies", () => {
    renderWithProviders(
      <WhyContent
        target={{
          ...SANDBOXED_ORDERS,
          cell: {
            value: "blocked",
            group_id: 1,
            groups: [
              { group_id: 1, name: "All internal users", value: "blocked" },
              { group_id: 3, name: "Sales", value: "blocked" },
            ],
            note: null,
          },
          security: null,
        }}
      />,
    );

    expect(
      screen.getByText(
        "Blocked in every group Sandy Sales is in. To let Sandy Sales see this table, give one of those groups access.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Applies")).not.toBeInTheDocument();
    expect(
      screen.queryByText("The most permissive group applies."),
    ).not.toBeInTheDocument();
  });

  it("says every group gives Can view when none differs, without Applies", () => {
    renderWithProviders(
      <WhyContent
        target={{
          ...SANDBOXED_ORDERS,
          cell: {
            value: "unrestricted",
            group_id: 1,
            groups: [
              {
                group_id: 1,
                name: "All internal users",
                value: "unrestricted",
              },
              { group_id: 3, name: "Sales", value: "unrestricted" },
            ],
            note: null,
          },
          security: null,
        }}
      />,
    );

    expect(
      screen.getByText(
        "Every group Sandy Sales is in sets View data to Can view.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Applies")).not.toBeInTheDocument();
  });

  it("marks the group that applies when the groups differ", () => {
    renderWithProviders(
      <WhyContent
        target={{
          ...SANDBOXED_ORDERS,
          cell: {
            value: "unrestricted",
            group_id: 3,
            groups: [
              { group_id: 1, name: "All internal users", value: "blocked" },
              { group_id: 3, name: "Sales", value: "unrestricted" },
            ],
            note: null,
          },
          security: null,
        }}
      />,
    );

    expect(screen.getByText("Applies")).toBeInTheDocument();
    expect(
      screen.getByText("The most permissive group applies."),
    ).toBeInTheDocument();
  });
});
