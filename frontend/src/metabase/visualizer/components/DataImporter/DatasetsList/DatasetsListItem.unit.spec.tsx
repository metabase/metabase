import { renderWithProviders, screen } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import { createDataSource } from "metabase/visualizer/utils";
import type { IconName } from "metabase-types/api";

import { DatasetsListItem, type Item } from "./DatasetsListItem";

registerVisualizations();

interface SetupOpts {
  item: Pick<Item, "model" | "display">;
}

const setup = ({ item }: SetupOpts) => {
  renderWithProviders(
    <DatasetsListItem
      item={{ ...createDataSource("card", 1, "Orders"), ...item }}
      selected={false}
    />,
  );
};

describe("DatasetsListItem", () => {
  it.each<{ item: SetupOpts["item"]; icon: IconName }>([
    { item: { model: "card", display: "line" }, icon: "line" },
    { item: { model: "card", display: "bar" }, icon: "bar" },
    { item: { model: "dataset", display: "table" }, icon: "model" },
    { item: { model: "metric", display: "line" }, icon: "metric" },
  ])(
    "should show the $icon icon for a $item.model with $item.display display (metabase#83402)",
    ({ item, icon }) => {
      setup({ item });

      expect(screen.getByLabelText(`${icon} icon`)).toBeInTheDocument();
    },
  );
});
