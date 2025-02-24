import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getDashcardData } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import Visualization from "metabase/visualizations/components/Visualization";
import {
  extractReferencedColumns,
  getDataSourceIdFromNameRef,
  isDataSourceNameRef,
  parseDataSourceId,
} from "metabase/visualizer/utils";
import type {
  Dashboard,
  RowValues,
  VirtualDashboardCard,
} from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import type { VisualizationProps } from "../types";

type Props = VisualizationProps & {
  dashcard: VirtualDashboardCard;
  dashboard: Dashboard;
};

function VisualizerVisualizationInner({ dashcard }: Props) {
  const datasets = useSelector(state => getDashcardData(state, dashcard.id));

  const mergedData = useMemo(() => {
    const { columns, columnValuesMapping } = dashcard.visualization_settings
      .visualization as VisualizerHistoryItem;

    const referencedColumns = extractReferencedColumns(columnValuesMapping);

    const referencedColumnValuesMap: Record<string, RowValues> = {};
    referencedColumns.forEach(ref => {
      const { sourceId } = parseDataSourceId(ref.sourceId);
      const dataset = datasets[sourceId];
      if (!dataset) {
        return;
      }
      const columnIndex = dataset.data.cols.findIndex(
        col => col.name === ref.originalName,
      );
      if (columnIndex >= 0) {
        const values = dataset.data.rows.map(row => row[columnIndex]);
        referencedColumnValuesMap[ref.name] = values;
      }
    });

    const hasPivotGrouping = columns.some(col => col.name === "pivot-grouping");
    if (hasPivotGrouping) {
      const rowLengths = Object.values(referencedColumnValuesMap).map(
        values => values.length,
      );
      const maxLength = rowLengths.length > 0 ? Math.max(...rowLengths) : 0;
      referencedColumnValuesMap["pivot-grouping"] = new Array(maxLength).fill(
        0,
      );
    }

    const unzippedRows = columns.map(column =>
      (columnValuesMapping[column.name] ?? [])
        .map(valueSource => {
          if (isDataSourceNameRef(valueSource)) {
            const id = getDataSourceIdFromNameRef(valueSource);
            return `Not supported yet (card ${id})`;
          }
          const values = referencedColumnValuesMap[valueSource.name];
          if (!values) {
            return [];
          }
          return values;
        })
        .flat(),
    );

    return {
      cols: columns,
      rows: _.zip(...unzippedRows),
      results_metadata: { columns },
    };
  }, [dashcard, datasets]);

  const rawSeries = useMemo(() => {
    const { display, settings } = dashcard.visualization_settings
      .visualization as VisualizerHistoryItem;
    return [
      {
        card: {
          display,
          visualization_settings: settings,
        },

        data: mergedData,

        // Certain visualizations memoize settings computation based on series keys
        // This guarantees a visualization always rerenders on changes
        started_at: new Date().toISOString(),
      },
    ];
  }, [dashcard, mergedData]);

  return <Visualization rawSeries={rawSeries} isDashboard />;
}

export const VisualizerVisualization = Object.assign(
  VisualizerVisualizationInner,
  {
    uiName: t`Visualization`,
    identifier: "visualization",
    iconName: "table",

    canSavePng: false,
    noHeader: true,
    hidden: true,
    disableSettingsConfig: true,
    supportPreviewing: false,
    supportsSeries: false,
  },
);
