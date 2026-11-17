import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import type { AffectingAttribute, PrincipalType } from "../api";

import { AttributeBar } from "./AttributeBar";

const CATEGORY: AffectingAttribute = {
  attribute: "category",
  value: "Gizmo",
  uses: [
    {
      kind: "sandbox",
      label: "Orders",
      table_id: 2,
      column: "Products.Category",
    },
    {
      kind: "sandbox",
      label: "Products",
      table_id: 1,
      column: "Products.Category",
    },
  ],
  applies: false,
  other_values: ["Doohickey", "Gizmo"],
};

const VENDOR: AffectingAttribute = {
  attribute: "vendor",
  value: "Zemlak-Wiegand and Sons",
  uses: [],
  applies: false,
  other_values: [],
};

describe("AttributeBar", () => {
  it("shows only the attributes a rule uses, after User attributes used by rules", () => {
    setup({ attributes: [CATEGORY, VENDOR] });

    expect(
      screen.getByText("User attributes used by rules:"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /category/ })).toHaveTextContent(
      "categoryGizmo",
    );
    expect(
      screen.queryByRole("button", { name: /vendor/ }),
    ).not.toBeInTheDocument();
  });

  it("shows no line at all when no rule uses any attribute", () => {
    setup({ attributes: [VENDOR] });

    expect(
      screen.queryByRole("toolbar", { name: "User attributes used by rules" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/User attributes/)).not.toBeInTheDocument();
  });

  it("says in the popover which tables' row and column security uses the attribute", async () => {
    setup({ attributes: [CATEGORY] });

    await userEvent.click(screen.getByRole("button", { name: /category/ }));

    expect(
      await screen.findByText(
        "Used by row and column security on Orders and Products",
      ),
    ).toBeInTheDocument();
  });

  it("says a user's value comes from their tenant when the tenant has no name", async () => {
    setup({ attributes: [{ ...CATEGORY, source: "tenant" }] });

    await userEvent.click(screen.getByRole("button", { name: /category/ }));

    expect(
      await screen.findByText("Sandy Sales's value: Gizmo, from their tenant"),
    ).toBeInTheDocument();
  });

  it("hides the User attributes used by rules label while the attributes load", () => {
    setup({ attributes: [], isLoading: true });

    expect(
      screen.getByRole("toolbar", { name: "User attributes used by rules" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("User attributes used by rules:"),
    ).not.toBeInTheDocument();
  });

  it("says on a group's chip how many of its members have the value", () => {
    setup({
      attributes: [
        {
          ...CATEGORY,
          value: "Gadget",
          member_values: [
            { value: "Gadget", count: 2 },
            { value: "Gizmo", count: 5 },
          ],
        },
      ],
      principalType: "group",
      groupMemberCount: 7,
    });

    expect(screen.getByRole("button", { name: /category/ })).toHaveTextContent(
      "categoryGadget· 2 of 7 members",
    );
  });

  it("doesn't count members on a user's chip", () => {
    setup({ attributes: [CATEGORY], groupMemberCount: 7 });

    expect(screen.getByRole("button", { name: /category/ })).toHaveTextContent(
      /^categoryGizmo$/,
    );
  });
});

type SetupOpts = {
  attributes: AffectingAttribute[];
  isLoading?: boolean;
  principalType?: PrincipalType;
  groupMemberCount?: number;
};

function setup({
  attributes,
  isLoading = false,
  principalType = "user",
  groupMemberCount,
}: SetupOpts) {
  renderWithProviders(
    <AttributeBar
      principalType={principalType}
      whoName="Sandy Sales"
      attributes={attributes}
      isLoading={isLoading}
      pickedValues={{}}
      groupMemberCount={groupMemberCount}
      onPick={jest.fn()}
    />,
  );
}
