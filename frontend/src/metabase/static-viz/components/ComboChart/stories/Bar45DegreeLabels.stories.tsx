import { StaticVisualization } from "../../StaticVisualization";
import { data } from "../stories-data";

import { Template, renderingContext } from "./shared";

export default {
  title: "Viz/Static Viz/ComboChart",
  component: StaticVisualization,
};

export const Bar45DegreeLabels = {
  render: Template,
  args: {
    rawSeries: data.bar45DegreeLabels,
    renderingContext,
  },
};
