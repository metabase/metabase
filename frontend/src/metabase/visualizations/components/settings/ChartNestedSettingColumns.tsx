import type { ReactNode } from "react";

import type { DatasetColumn } from "metabase-types/api";

import type { EditWidgetData } from "./ChartSettingTableColumns/types";
import { ColumnItem } from "./ColumnItem";

const displayNameForColumn = (column?: DatasetColumn) =>
  column ? column.display_name || column.name : "[Unknown]";

export interface ChartNestedSettingColumnsProps {
  object?: DatasetColumn;
  objects: DatasetColumn[];
  objectSettingsWidgets?: ReactNode;
  id: string;
  getObjectKey: (object: DatasetColumn) => string;
  onShowWidget: (widget: EditWidgetData, target: HTMLElement) => void;
}

export const ChartNestedSettingColumns = ({
  object,
  objects,
  objectSettingsWidgets,
  id,
  getObjectKey,
  onShowWidget,
}: ChartNestedSettingColumnsProps) => {
  if (object) {
    return <div>{objectSettingsWidgets}</div>;
  }

  return (
    <div>
      {objects.map((column, index) => (
        <ColumnItem
          key={index}
          title={displayNameForColumn(column)}
          onEdit={(target) =>
            onShowWidget(
              { id, props: { initialKey: getObjectKey(column) } },
              target,
            )
          }
        />
      ))}
    </div>
  );
};
