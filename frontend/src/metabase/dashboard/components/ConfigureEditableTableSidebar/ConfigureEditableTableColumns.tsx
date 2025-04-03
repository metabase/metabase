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
import { ColumnItem } from "metabase/visualizations/components/settings/ColumnItem";
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

  const handleEnableDisable = useCallback(
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
            item.enabled
              ? () => handleEnableDisable(item.name, false)
              : undefined
          }
          onEnable={
            !item.enabled
              ? () => handleEnableDisable(item.name, true)
              : undefined
          }
          draggable={!isDragDisabled}
          icon={item.icon}
        />
      </Sortable>
    ),
    [isDragDisabled, handleEnableDisable],
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
    const fields = dashcard.card.result_metadata ?? [];
    // const columnSettings =
    //   dashcard.card.visualization_settings?.["table.columns"] ?? [];
    const columnSettings =
      (dashcard.visualization_settings?.[
        "table.columns"
      ] as TableColumnOrderSetting[]) ?? [];

    const nameToSettingMap: Record<string, TableColumnOrderSetting> = {};
    const nameToFieldMap: Record<string, Field> = {};
    const nameOrder: string[] = [];

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      nameToFieldMap[field.name] = field;
    }

    for (let i = 0; i < columnSettings.length; i++) {
      const setting = columnSettings[i];

      nameToSettingMap[setting.name] = setting;

      // If column is deleted and settings are preserved, we need to exclude it
      // from the list of items to be displayed in the sidebar
      if (nameToFieldMap[setting.name]) {
        nameOrder.push(setting.name);
      }
    }

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      // If the field is not in the settings, we need to add it to the list of items
      if (!nameToSettingMap[field.name]) {
        nameOrder.push(field.name);
      }
    }

    return nameOrder.map((name) => {
      const setting = nameToSettingMap[name];
      const field = nameToFieldMap[name];

      return {
        id: field.name,
        name: field.name,
        title: field.display_name,
        enabled: setting?.enabled ?? true,
        icon: field.semantic_type
          ? FIELD_SEMANTIC_TYPES_MAP[field.semantic_type].icon
          : "string",
      };
    });
  }, [dashcard.card.result_metadata, dashcard.visualization_settings]);
}
