import { PointerSensor, useSensor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useMemo } from "react";

import {
  type DragEndEvent,
  Sortable,
  SortableList,
} from "metabase/common/components/Sortable";
import {
  onUpdateDashCardVisualizationSettings,
  updateEditableTableCardQueryInEditMode,
} from "metabase/dashboard/actions";
import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { ChartSettingActionIcon } from "metabase/visualizations/components/settings/ChartSettingActionIcon";
import { mergeSettings } from "metabase/visualizations/lib/settings/typed-utils";
import type { OrderByDirection } from "metabase-lib";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  DashboardCard,
  DatasetColumn,
  Field,
  TableColumnOrderSetting,
} from "metabase-types/api";

import { ColumnItem } from "./ColumnItem";
import { ColumnSortingActionMenu } from "./ColumnSortingActionMenu";
import type { EditableTableColumnSettingItem } from "./types";
import { useTableSorting } from "./use-table-sorting";

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
  const metadata = useSelector(getMetadata);

  const card = dashcard.card as Card; // this component is only used for editable table card, which is always a Card
  const question = useMemo(() => {
    return new Question(card, metadata);
  }, [card, metadata]);

  const { getColumnSortDirection } = useTableSorting({ question });

  const items = useEditableTableColumnSettingItems(
    dashcard,
    getColumnSortDirection,
  );
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

  const handleUpdateColumnSorting = useCallback(
    (columnId: string, direction: OrderByDirection | null) => {
      const query = question.query();
      const stageIndex = -1;

      const columns = card.result_metadata ?? [];
      const columnOrField = columns.find((field) => field.name === columnId);

      if (columnOrField) {
        const column = Lib.findMatchingColumn(
          query,
          stageIndex,
          Lib.fromLegacyColumn(query, stageIndex, columnOrField),
          Lib.orderableColumns(query, stageIndex),
        );

        if (column != null) {
          let newQuery = Lib.removeOrderBys(query, stageIndex);

          if (direction !== null) {
            // if direction is null, then we just remove sorting
            newQuery = Lib.orderBy(newQuery, stageIndex, column, direction);
          }

          const legacyQuery = Lib.toLegacyQuery(newQuery);

          dispatch(
            updateEditableTableCardQueryInEditMode({
              dashcardId: dashcard.id,
              cardId: card.id,
              newCard: {
                ...card,
                dataset_query: legacyQuery,
              },
            }),
          );
        }
      }
    },
    [card, dashcard.id, dispatch, question],
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
          draggable={!isDragDisabled}
          icon={item.icon}
        >
          <ColumnSortingActionMenu
            columnSettings={item}
            onSort={handleUpdateColumnSorting}
          />
          {item.enabled ? (
            <ChartSettingActionIcon
              icon="eye_outline"
              onClick={() => handleShowHide(item.name, false)}
              data-testid={`${item.title}-hide-button`}
            />
          ) : (
            <ChartSettingActionIcon
              icon="eye_crossed_out"
              onClick={() => handleShowHide(item.name, true)}
              data-testid={`${item.title}-hide-button`}
            />
          )}
          <ChartSettingActionIcon
            icon={item.enabled && item.editable ? "pencil" : "edit_disabled"}
            onClick={() => handleUpdateEditable(item.name, !item.editable)}
          />
        </ColumnItem>
      </Sortable>
    ),
    [
      isDragDisabled,
      handleUpdateColumnSorting,
      handleShowHide,
      handleUpdateEditable,
    ],
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

function useEditableTableColumnSettingItems(
  dashcard: DashboardCard,
  getColumnSortDirection: (
    columnOrField: DatasetColumn | Field,
  ) => OrderByDirection | undefined,
): EditableTableColumnSettingItem[] {
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

    const editableColumnSet = new Set(columnEditableSettings);

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
        sortDirection: getColumnSortDirection(field),
      };
    });
  }, [dashcard, getColumnSortDirection]);
}
