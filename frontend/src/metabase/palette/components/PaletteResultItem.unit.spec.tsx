import { render, screen } from "__support__/ui";
import { color } from "metabase/lib/colors";

import type { PaletteActionImpl } from "../types";

import { PaletteResultItem } from "./PaletteResultItem";

const mockPaletteActionImpl = (opts: Partial<PaletteActionImpl>) =>
  ({
    name: "test action",
    id: "action-1",
    ancestors: [],
    children: [],
    ...opts,
  } as PaletteActionImpl);

const setup = ({
  active = false,
  item = {},
}: {
  active?: boolean;
  item?: Partial<PaletteActionImpl>;
}) => {
  render(
    <PaletteResultItem item={mockPaletteActionImpl(item)} active={active} />,
  );
};

describe("PaletteResultItem", () => {
  it("icons should default to brand color", async () => {
    setup({ item: { icon: "model" } });

    expect(await screen.findByRole("img", { name: /model/ })).toHaveAttribute(
      "color",
      color("brand"),
    );
  });

  it("icons should use provided colors when available", async () => {
    setup({ item: { icon: "model", extra: { iconColor: "green" } } });

    expect(await screen.findByRole("img", { name: /model/ })).toHaveAttribute(
      "color",
      color("green"),
    );
  });

  it("if active, icon color should always be white", async () => {
    setup({
      item: { icon: "model", extra: { iconColor: "green" } },
      active: true,
    });

    expect(await screen.findByRole("img", { name: /model/ })).toHaveAttribute(
      "color",
      color("white"),
    );
  });

  it("should not render an icon if none is provided", async () => {
    setup({});
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
