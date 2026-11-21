import { useMemo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { SegmentedControl } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { FieldId } from "metabase-types/api";

import {
  type PrototypeFilterUsage,
  useListPrototypeFilterUsageQuery,
} from "./api";
import type { DraftColumn, SuggestionGroup } from "./types";
import type { ColumnGroup } from "./utils";

const POPULAR_LIMIT = 15;

export type ColumnPickerMode = "auto" | "popular" | "alphabetical";

export type ColumnPickerItem =
  | { type: "column"; column: DraftColumn }
  | { type: "segment"; segment: Lib.SegmentMetadata };

interface ColumnSuggestions {
  groups: SuggestionGroup[];
  getItem: (key: string) => ColumnPickerItem | undefined;
}

/**
 * Prototype: the options of the column step, in one of three modes, from the
 * AI filters prototype:
 * - auto: the columns of each table in the LLM categories of their fields,
 *   or in table order for tables without categories;
 * - popular: the columns that saved questions filter on most often;
 * - alphabetical: the columns of each table from A to Z.
 */
export function useColumnSuggestions(
  query: Lib.Query,
  stageIndex: number,
  columnGroups: ColumnGroup[],
  mode: ColumnPickerMode,
  isSearching: boolean,
): ColumnSuggestions {
  const { data: filterUsage } = useListPrototypeFilterUsageQuery();

  return useMemo(() => {
    const items = new Map<string, ColumnPickerItem>();
    const fieldIdOf = (column: DraftColumn) =>
      Lib.fieldValuesSearchInfo(query, column.column).fieldId;
    const columnOption = (key: string, column: DraftColumn) => {
      items.set(key, { type: "column", column });
      return {
        value: key,
        label: column.label,
        icon: getColumnIcon(column.column),
      };
    };

    const tableGroups = columnGroups.flatMap(
      (group, groupIndex): SuggestionGroup[] => {
        const segmentGroup: SuggestionGroup = {
          section: group.label,
          sectionIcon: group.icon,
          options: group.segments.map((segment, segmentIndex) => {
            const key = `segment:${groupIndex}:${segmentIndex}`;
            items.set(key, { type: "segment", segment });
            return {
              value: key,
              label: Lib.displayInfo(query, stageIndex, segment).displayName,
              icon: "segment" as const,
            };
          }),
        };
        const keyedColumns = group.columns.map((column, columnIndex) => ({
          key: `column:${groupIndex}:${columnIndex}`,
          column,
        }));

        if (mode === "alphabetical") {
          return [
            segmentGroup,
            {
              section: group.label,
              options: [...keyedColumns]
                .sort((a, b) => a.column.label.localeCompare(b.column.label))
                .map(({ key, column }) => columnOption(key, column)),
            },
          ];
        }

        // Like the app's picker: each table's columns in table order.
        return [
          segmentGroup,
          {
            section: group.label,
            sectionIcon: group.icon,
            options: keyedColumns.map(({ key, column }) =>
              columnOption(key, column),
            ),
          },
        ];
      },
    );

    if (mode !== "popular" || isSearching) {
      return { groups: tableGroups, getItem: (key) => items.get(key) };
    }

    return {
      groups: [
        {
          options: getPopularColumns(columnGroups, filterUsage, fieldIdOf).map(
            ({ key, column, tableLabel }) => ({
              ...columnOption(key, column),
              description: tableLabel,
            }),
          ),
        },
      ],
      getItem: (key) => items.get(key),
    };
  }, [query, stageIndex, columnGroups, mode, isSearching, filterUsage]);
}

function getPopularColumns(
  columnGroups: ColumnGroup[],
  filterUsage: PrototypeFilterUsage[] | undefined,
  fieldIdOf: (column: DraftColumn) => FieldId | null,
) {
  const ratioByFieldId = new Map(
    (filterUsage ?? []).map((usage) => [usage.field_id, usage.ratio]),
  );
  return columnGroups
    .flatMap((group, groupIndex) =>
      group.columns.flatMap((column, columnIndex) => {
        const fieldId = fieldIdOf(column);
        const ratio = fieldId != null ? ratioByFieldId.get(fieldId) : undefined;
        return ratio != null
          ? [
              {
                key: `column:${groupIndex}:${columnIndex}`,
                column,
                tableLabel: group.label,
                ratio,
              },
            ]
          : [];
      }),
    )
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, POPULAR_LIMIT);
}

interface ColumnPickerModeControlProps {
  value: ColumnPickerMode;
  onChange: (value: ColumnPickerMode) => void;
}

export function ColumnPickerModeControl({
  value,
  onChange,
}: ColumnPickerModeControlProps) {
  return (
    <SegmentedControl
      fullWidth
      value={value}
      data={[
        { value: "auto", label: t`Auto` },
        { value: "popular", label: t`Popular` },
        { value: "alphabetical", label: t`A to Z` },
      ]}
      onChange={(newValue) => {
        if (
          newValue === "auto" ||
          newValue === "popular" ||
          newValue === "alphabetical"
        ) {
          onChange(newValue);
        }
      }}
    />
  );
}
