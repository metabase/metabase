import { useMemo } from "react";
import { t } from "ttag";

import {
  type PrototypeFieldCategories,
  useListPrototypeFieldCategoriesQuery,
} from "metabase/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import * as Lib from "metabase-lib";
import type { FieldId } from "metabase-types/api";

import type { DraftColumn, SuggestionGroup } from "./types";
import type { ColumnGroup } from "./utils";

export type ColumnPickerItem =
  | { type: "column"; column: DraftColumn }
  | { type: "segment"; segment: Lib.SegmentMetadata };

interface ColumnSuggestions {
  groups: SuggestionGroup[];
  getItem: (key: string) => ColumnPickerItem | undefined;
}

/**
 * Prototype: the options of the column step, from the AI filters prototype:
 * the columns of each table in the LLM categories of their fields, or in table
 * order for tables without categories.
 */
export function useColumnSuggestions(
  query: Lib.Query,
  stageIndex: number,
  columnGroups: ColumnGroup[],
): ColumnSuggestions {
  const { data: fieldCategories } = useListPrototypeFieldCategoriesQuery();

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
          sectionIcon: "table" as const,
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

        const categories = getCategories(
          keyedColumns.map(({ column }) => fieldIdOf(column)),
          fieldCategories,
        );
        if (categories == null) {
          return [
            segmentGroup,
            {
              section: group.label,
              sectionIcon: "table" as const,
              options: keyedColumns.map(({ key, column }) =>
                columnOption(key, column),
              ),
            },
          ];
        }
        return [
          segmentGroup,
          ...categories.map((category) => ({
            section: group.label,
            sectionIcon: "table" as const,
            label: category.name,
            options: keyedColumns
              .filter(({ column }) => {
                const fieldId = fieldIdOf(column);
                return fieldId != null
                  ? category.fieldIds.has(fieldId)
                  : category.isOther;
              })
              .map(({ key, column }) => columnOption(key, column)),
          })),
        ];
      },
    );

    return { groups: tableGroups, getItem: (key) => items.get(key) };
  }, [query, stageIndex, columnGroups, fieldCategories]);
}

type Category = { name: string; fieldIds: Set<FieldId>; isOther: boolean };

/**
 * The categories of the table that the fields belong to, or null when the
 * table has no categories, for example when it has few columns.
 */
function getCategories(
  fieldIds: (FieldId | null)[],
  fieldCategories: PrototypeFieldCategories[] | undefined,
): Category[] | null {
  const tableCategories = fieldCategories?.find(({ categories }) =>
    categories.some((category) =>
      category.field_ids.some((fieldId) => fieldIds.includes(fieldId)),
    ),
  );
  if (tableCategories == null) {
    return null;
  }
  const categories = tableCategories.categories.map((category) => ({
    name: category.name,
    fieldIds: new Set(category.field_ids),
    isOther: category.name === "Other",
  }));
  // Columns without a category, like custom columns, go into "Other".
  const hasOther = categories.some((category) => category.isOther);
  return hasOther
    ? categories
    : [...categories, { name: t`Other`, fieldIds: new Set(), isOther: true }];
}
