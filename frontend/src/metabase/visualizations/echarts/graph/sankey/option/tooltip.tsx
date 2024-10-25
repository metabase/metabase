import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipBaseOption } from "metabase/visualizations/echarts/tooltip";
import type { DatasetColumn } from "metabase-types/api";

const ChartItemTooltip = ({ params, metricName }: any) => {
  const data = params.data;
  let header = "";
  if (data.name) {
    header = data.name;
  } else if (data.source == null) {
    header = data.target;
  } else if (data.target == null) {
    header = data.source;
  } else {
    header = `${data.source} → ${data.target}`;
  }
  return (
    <EChartsTooltip
      header={header}
      rows={[{ name: metricName, values: [params.value ?? data.value] }]}
    />
  );
};

export const getTooltipOption = (
  containerRef: React.RefObject<HTMLDivElement>,
  metricColumn: DatasetColumn,
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    triggerOn: "mousemove",
    formatter: params => {
      if (Array.isArray(params)) {
        return "";
      }

      return renderToString(
        <ChartItemTooltip
          params={params}
          metricName={metricColumn.display_name}
        />,
      );
    },
  };
};
