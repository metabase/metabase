import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import type { AffectingAttribute } from "../api";

import { AttributeBar, AttributeTag } from "./AttributeBar";

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
      groupMemberCount: 7,
    });

    expect(screen.getByRole("button", { name: /category/ })).toHaveTextContent(
      "categoryGadget· 2 of 7 members",
    );
  });

  it("guard: counts no members while the group's size is unknown", () => {
    setup({ attributes: [CATEGORY] });

    expect(screen.getByRole("button", { name: /category/ })).toHaveTextContent(
      /^categoryGizmo$/,
    );
  });

  it("sets the label and the chip text in the filter pill's 14px", () => {
    setup({ attributes: [CATEGORY] });

    const fontSize = "--text-fz: var(--mantine-font-size-md)";
    expect(screen.getByText("User attributes used by rules:")).toHaveStyle(
      fontSize,
    );
    expect(screen.getByText("category")).toHaveStyle(fontSize);
    expect(screen.getByText("category")).toHaveStyle("font-weight: bold");
    expect(screen.getByText("Gizmo")).toHaveStyle(fontSize);
  });

  it("sets a group's member count in 14px too", () => {
    setup({
      attributes: [
        { ...CATEGORY, member_values: [{ value: "Gizmo", count: 2 }] },
      ],
      groupMemberCount: 7,
    });

    expect(screen.getByText("· 2 of 7 members")).toHaveStyle(
      "--text-fz: var(--mantine-font-size-md)",
    );
  });

  it("makes the chip 24px tall", () => {
    setup({ attributes: [CATEGORY] });

    expect(screen.getByRole("button", { name: /category/ })).toHaveStyle({
      height: "1.5rem",
    });
  });

  it("puts 8px between the chips", () => {
    setup({ attributes: [CATEGORY] });

    expect(
      screen.getByRole("toolbar", { name: "User attributes used by rules" }),
    ).toHaveStyle("--group-gap: var(--mantine-spacing-sm)");
  });

  it("puts a 12px chevron 8px from the value", () => {
    setup({ attributes: [CATEGORY] });

    const chevron = within(
      screen.getByRole("button", { name: /category/ }),
    ).getByRole("img", { name: /chevron/ });
    expect(chevron).toHaveAttribute("width", "12");
    expect(chevron).toHaveStyle("margin-left: var(--mantine-spacing-xxs)");
  });

  it("guard: opens the value picker from the chip", async () => {
    setup({ attributes: [CATEGORY] });

    await userEvent.click(screen.getByRole("button", { name: /category/ }));

    expect(
      await screen.findByRole("listbox", { name: "Values of category" }),
    ).toBeInTheDocument();
  });
});

describe("AttributeTag", () => {
  it("sets the attribute and its value in 14px, like the attribute bar's chip", () => {
    renderWithProviders(<AttributeTag attribute="category" value="Gizmo" />);

    const fontSize = "--text-fz: var(--mantine-font-size-md)";
    expect(screen.getByText("category")).toHaveStyle(fontSize);
    expect(screen.getByText("Gizmo")).toHaveStyle(fontSize);
  });
});

type SetupOpts = {
  attributes: AffectingAttribute[];
  isLoading?: boolean;
  isLabelOnOwnRow?: boolean;
  groupMemberCount?: number;
};

function setup({
  attributes,
  isLoading = false,
  isLabelOnOwnRow,
  groupMemberCount,
}: SetupOpts) {
  renderWithProviders(
    <AttributeBar
      attributes={attributes}
      isLoading={isLoading}
      isLabelOnOwnRow={isLabelOnOwnRow}
      pickedValues={{}}
      groupMemberCount={groupMemberCount}
      onPick={jest.fn()}
    />,
  );
}
