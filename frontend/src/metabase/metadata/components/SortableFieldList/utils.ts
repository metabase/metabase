import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import type { DragEndEvent } from "metabase/core/components/Sortable";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { type IconName, isValidIconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DimensionReference, Field, Table } from "metabase-types/api";

interface Item {
  id: DragEndEvent["id"];
  icon: IconName;
  label: string;
  position: number;
}

export function getId(item: Item): Item["id"] {
  return item.id;
}

export function getItems(metadata: Metadata, table: Table): Item[] {
  if (!table.fields) {
    return [];
  }

  return table.fields.map((field) => {
    const icon = getFieldIcon(metadata, table, field);

    return {
      id: getFieldId(field),
      icon: isValidIconName(icon) ? icon : "empty",
      label: getFieldDisplayName(field) || NULL_DISPLAY_VALUE,
      position: field.position,
    };
  });
}

export function getItemsOrder(items: Item[]): Item["id"][] {
  return _.sortBy(items, (item) => item.position).map((item) => item.id);
}

export function sortItems(items: Item[], order: Item["id"][]) {
  const indexMap = Object.fromEntries(order.map((id, index) => [id, index]));

  return items.sort((a, b) => indexMap[a.id] - indexMap[b.id]);
}

function getFieldId(field: Field): string | number {
  if (Array.isArray(field.id)) {
    return field.id[1];
  }

  return field.id;
}

function getFieldDisplayName(field: Field): string {
  return field.dimensions?.[0]?.name || field.display_name || field.name;
}

function getFieldIcon(
  metadata: Metadata,
  table: Table,
  field: Field,
): IconName {
  const databaseId = table.db_id;
  const metadataProvider = Lib.metadataProvider(databaseId, metadata);
  const query = Lib.fromLegacyQuery(databaseId, metadataProvider, {
    type: "query",
    database: databaseId,
    query: {
      "source-table": field.table_id,
    },
  });
  const columns = Lib.visibleColumns(query, 0);
  const fieldId = getFieldId(field);

  // fieldId should never be a string in this context because it's a raw table field
  if (typeof fieldId === "string") {
    return "list"; // the same fallback as in getColumnIcon
  }

  const fieldRef: DimensionReference = ["field", fieldId, null];
  const [index] = Lib.findColumnIndexesFromLegacyRefs(query, 0, columns, [
    fieldRef,
  ]);
  const column = columns[index];

  return getColumnIcon(column);
}
