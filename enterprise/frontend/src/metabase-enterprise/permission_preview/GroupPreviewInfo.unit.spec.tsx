import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";

import { GroupPreviewInfo } from "./GroupPreviewInfo";

describe("GroupPreviewInfo", () => {
  it("opens on hover and closes when the pointer leaves", async () => {
    setup();

    await userEvent.hover(getLabel("How group preview works"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "A stand-in, not a real user",
    );

    await userEvent.unhover(getLabel("How group preview works"));
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  });

  it("opens on keyboard focus, with nothing to click inside, and closes on Escape", async () => {
    setup();

    await userEvent.tab();
    expect(getLabel("How group preview works")).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("A stand-in, not a real user");
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  });

  it("names the stand-in's groups and says it uses the picked values", async () => {
    setup({ groupNames: ["All internal users", "Sales"] });

    act(() => getLabel("How group preview works").focus());

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(
      "In All internal users and Sales only. Where a rule reads an attribute, it uses the value you pick.",
    );
    expect(tooltip).toHaveTextContent(
      "Real members may see more through their other groups.",
    );
  });

  it("says the grids use each member's own value", async () => {
    setup({
      groupNames: ["All internal users"],
      attributeValues: "each-member",
    });

    act(() => getLabel("How group preview works").focus());

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "In All internal users only. Where a rule reads an attribute, it uses each member's own value.",
    );
  });

  it("reads How it works on a narrow band, named after group preview", () => {
    setup({ isCompact: true });

    expect(
      screen.getByRole("button", { name: "How it works: group preview" }),
    ).toHaveTextContent("How it works");
  });
});

type SetupOpts = {
  groupNames?: string[];
  attributeValues?: "picked" | "each-member";
  isCompact?: boolean;
};

function setup({
  groupNames = ["All internal users", "Sales"],
  attributeValues = "picked",
  isCompact = false,
}: SetupOpts = {}) {
  renderWithProviders(
    <GroupPreviewInfo
      groupNames={groupNames}
      attributeValues={attributeValues}
      isCompact={isCompact}
    />,
  );
}

/** The label's name also carries its icon's, "info icon". */
function getLabel(text: string) {
  return screen.getByRole("button", { name: `info icon ${text}` });
}
