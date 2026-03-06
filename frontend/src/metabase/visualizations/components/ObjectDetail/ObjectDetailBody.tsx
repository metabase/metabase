import type {
  DatasetColumn,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import { ObjectDetailBodyWrapper } from "./ObjectDetailBody.styled";
import { DetailsTable } from "./ObjectDetailsTable";
import type { OnVisualizationClickType } from "./types";

export interface ObjectDetailBodyProps {
  columns: DatasetColumn[];
  zoomedRow: RowValue[];
  settings: VisualizationSettings;
  onVisualizationClick: OnVisualizationClickType;
  visualizationIsClickable: (clicked: unknown) => boolean;
}

export function ObjectDetailBody({
  columns,
  zoomedRow,
  settings,
  onVisualizationClick,
  visualizationIsClickable,
}: ObjectDetailBodyProps): JSX.Element {
  return (
    <ObjectDetailBodyWrapper>
      <DetailsTable
        columns={columns}
        zoomedRow={zoomedRow}
        settings={settings}
        onVisualizationClick={onVisualizationClick}
        visualizationIsClickable={visualizationIsClickable}
      />
    </ObjectDetailBodyWrapper>
  );
}
