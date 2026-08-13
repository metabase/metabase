import { Box } from "metabase/ui";
import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import S from "./ObjectDetailBody.module.css";
import { DetailsTable } from "./ObjectDetailsTable";
import type { OnVisualizationClickType } from "./types";

export interface ObjectDetailBodyProps {
  columns: DatasetColumn[];
  zoomedRow: RowValue[];
  settings: VisualizationSettings;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
  isDashboard: boolean;
}

export function ObjectDetailBody({
  columns,
  zoomedRow,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
  isDashboard,
}: ObjectDetailBodyProps): JSX.Element {
  return (
    <Box flex={1} className={S.body}>
      <DetailsTable
        columns={columns}
        zoomedRow={zoomedRow}
        settings={settings}
        onVisualizationClick={onVisualizationClick}
        visualizationIsClickable={visualizationIsClickable}
        isDashboard={isDashboard}
      />
    </Box>
  );
}
