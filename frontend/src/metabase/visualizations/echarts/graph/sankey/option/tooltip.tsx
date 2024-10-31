import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipBaseOption } from "metabase/visualizations/echarts/tooltip";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";

interface ChartItemTooltipProps {
  metricColumnKey: string;
  metricColumnName: string;
  params: any;
}

const ChartItemTooltip = ({
  params,
  metricColumnKey,
  metricColumnName,
}: ChartItemTooltipProps) => {
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
      rows={[
        {
          name: metricColumnName,
          values: [
            params.dataType === "node"
              ? (data.columnValues[metricColumnKey] ?? 0)
              : params.value,
          ],
        },
      ]}
    />
  );
};

export const getTooltipOption = (
  containerRef: React.RefObject<HTMLDivElement>,
  metricColumn: DatasetColumn,
): TooltipOption => {
  const metricColumnName = getFriendlyName(metricColumn);
  const metricColumnKey = getColumnKey(metricColumn);
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
          metricColumnName={metricColumnName}
          metricColumnKey={metricColumnKey}
        />,
      );
    },
  };
};
