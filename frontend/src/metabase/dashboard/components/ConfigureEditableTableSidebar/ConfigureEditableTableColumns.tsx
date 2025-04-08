import { PointerSensor, useSensor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useMemo } from "react";

import {
  type DragEndEvent,
  Sortable,
  SortableList,
} from "metabase/core/components/Sortable";
import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { useDispatch } from "metabase/lib/redux";
import { ChartSettingActionIcon } from "metabase/visualizations/components/settings/ChartSettingActionIcon";
import { ColumnItem } from "metabase/visualizations/components/settings/ColumnItem";
import { mergeSettings } from "metabase/visualizations/lib/settings/typed-utils";
import type {
  DashboardCard,
  Field,
  TableColumnOrderSetting,
} from "metabase-types/api";

type ConfigureEditableTableColumnsProps = {
  dashcard: DashboardCard;
};

export function ConfigureEditableTableColumns({
  dashcard,
}: ConfigureEditableTableColumnsProps) {
  const dispatch = useDispatch();
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const items = useEditableTableColumnSettingItems(dashcard);
  const isDragDisabled = items.length < 1;

  const handleSortEnd = useCallback(
    ({ id, newIndex }: DragEndEvent) => {
      const oldIndex = items.findIndex((item) => item.id === id);
      const newArray = arrayMove(items, oldIndex, newIndex);

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "table.columns": newArray.map((it) => ({
            name: it.name,
            enabled: it.enabled,
          })),
        }),
      );
    },
    [dispatch, dashcard.id, items],
  );

  const handleShowHide = useCallback(
    (name: string, enabled: boolean) => {
      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "table.columns": items.map((it) => ({
            name: it.name,
            enabled: it.name === name ? enabled : it.enabled,
          })),
        }),
      );
    },
    [dashcard.id, dispatch, items],
  );

  const handleUpdateEditable = useCallback(
    (name: string, editable: boolean) => {
      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "table.editableColumns": items
            .filter(
              editable
                ? (it) => it.editable || it.name === name
                : (it) => it.editable && it.name !== name,
            )
            .map((it) => it.name),
        }),
      );
    },
    [dashcard.id, dispatch, items],
  );

  const renderItem = useCallback(
    ({
      item,
      id,
    }: {
      item: EditableTableColumnSettingItem;
      id: string | number;
    }) => (
      <Sortable
        id={id}
        key={`sortable-${id}`}
        disabled={isDragDisabled}
        draggingStyle={{ opacity: 0.5 }}
      >
        <ColumnItem
          title={item.title}
          onRemove={
            item.enabled ? () => handleShowHide(item.name, false) : undefined
          }
          onEnable={
            !item.enabled ? () => handleShowHide(item.name, true) : undefined
          }
          draggable={!isDragDisabled}
          icon={item.icon}
          additionalActions={
            <ChartSettingActionIcon
              icon={item.editable ? "pencil" : "line_style_solid"}
              onClick={() => handleUpdateEditable(item.name, !item.editable)}
            />
          }
        />
      </Sortable>
    ),
    [isDragDisabled, handleShowHide, handleUpdateEditable],
  );

  return (
    <SortableList
      getId={(item) => item.id}
      items={items}
      renderItem={renderItem}
      onSortEnd={handleSortEnd}
      sensors={[pointerSensor]}
    />
  );
}

type EditableTableColumnSettingItem = ReturnType<
  typeof useEditableTableColumnSettingItems
>[number];

function useEditableTableColumnSettingItems(dashcard: DashboardCard) {
  return useMemo(() => {
    const fieldsWithRemmapedColumns = dashcard.card.result_metadata ?? [];
    const settings = mergeSettings(
      dashcard.card.visualization_settings,
      dashcard.visualization_settings,
    );

    const fields = fieldsWithRemmapedColumns.filter((field) => {
      if ("remapped_from" in field) {
        return !field.remapped_from;
      }
      return true;
    });

    const columnDisplaySettings = settings["table.columns"] ?? [];
    const columnEditableSettings = settings["table.editableColumns"] ?? [];

    const nameToDisplaySettingMap: Record<string, TableColumnOrderSetting> = {};
    const nameToFieldMap: Record<string, Field> = {};
    const nameOrder: string[] = [];

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      nameToFieldMap[field.name] = field;
    }

    for (let i = 0; i < columnDisplaySettings.length; i++) {
      const setting = columnDisplaySettings[i];

      nameToDisplaySettingMap[setting.name] = setting;

      // If column is deleted and settings are preserved, we need to exclude it
      // from the list of items to be displayed in the sidebar
      if (nameToFieldMap[setting.name]) {
        nameOrder.push(setting.name);
      }
    }

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      // If the field is not in the settings, we need to add it to the list of items
      if (!nameToDisplaySettingMap[field.name]) {
        nameOrder.push(field.name);
      }
    }

    // By default all columns are editable if no settings are provided
    // If settings are provided, we preserve them even if a new column is added
    const editableColumnSet = new Set(
      columnEditableSettings.length > 0
        ? columnEditableSettings
        : fields.map((it) => it.name),
    );

    return nameOrder.map((name) => {
      const setting = nameToDisplaySettingMap[name];
      const field = nameToFieldMap[name];

      return {
        id: field.name,
        name: field.name,
        title: field.display_name,
        enabled: setting?.enabled ?? true,
        editable: editableColumnSet.has(field.name),
        icon: field.semantic_type
          ? FIELD_SEMANTIC_TYPES_MAP[field.semantic_type].icon
          : "string",
      };
    });
  }, [
    dashcard.card.result_metadata,
    dashcard.visualization_settings,
    dashcard.card.visualization_settings,
  ]);
}
