import { data } from "../stories-data";

import { Template, comboChartMeta, renderingContext } from "./shared";

export default comboChartMeta;

export const Bar45DegreeLabels = {
  render: Template,
  args: {
    rawSeries: data.bar45DegreeLabels,
    renderingContext,
  },
};
