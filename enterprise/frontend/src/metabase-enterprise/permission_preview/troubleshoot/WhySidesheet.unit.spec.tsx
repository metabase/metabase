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
        "Sandy Sales is blocked in every group they're in. To let them see this table, give one of those groups access.",
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
        "Sandy Sales has View data set to Can view in every group they're in.",
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

  it("spaces the group rows 16px apart, like the rows of every other list", () => {
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

    // the rows' stack has no role or label to find it by
    const groupRows = screen
      .getByText("Sales")
      .closest('[class*="Stack-root"]');
    expect(groupRows).toHaveStyle({
      "--stack-gap": "var(--mantine-spacing-lg)",
    });
  });

  it("shows a group's name in full and lets its status drop under it where the row is narrow", () => {
    renderWithProviders(
      <WhyContent
        target={{
          ...SANDBOXED_ORDERS,
          security: null,
        }}
      />,
    );

    const name = screen.getByText("Sales");
    expect(name).not.toHaveAttribute("data-truncate");
    // the row has no role or label to find it by
    const nameAndApplies = name.closest('[class*="Flex-root"]');
    expect(nameAndApplies?.parentElement).toHaveStyle({ flexWrap: "wrap" });
  });

  it("aligns a group's status with the first line of its name, which can wrap", () => {
    renderWithProviders(
      <WhyContent target={{ ...SANDBOXED_ORDERS, security: null }} />,
    );

    // the row has no role or label to find it by
    const nameAndApplies = screen
      .getByText("Sales")
      .closest('[class*="Flex-root"]');
    expect(nameAndApplies?.parentElement).toHaveStyle({
      alignItems: "flex-start",
    });
  });

  it("puts each label of the rule card above its value, at every width", () => {
    renderWithProviders(<WhyContent target={SANDBOXED_ORDERS} />);

    // the label and its value have no role or label to find them by
    expect(
      screen.getByText("Set by").closest('[class*="Stack-root"]'),
    ).toHaveTextContent(/^Set bySales$/);
    expect(
      screen.getByText("Columns").closest('[class*="Stack-root"]'),
    ).toHaveTextContent(/^ColumnsAll columns$/);
  });
});
