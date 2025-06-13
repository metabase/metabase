import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import {
  getFieldDisplayName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { FieldId, Table } from "metabase-types/api";

interface Item {
  id: FieldId;
  icon: IconName;
  label: string;
  position: number;
}

export function getId(item: Item): Item["id"] {
  return item.id;
}

export function getItems(table: Table): Item[] {
  if (!table.fields) {
    return [];
  }

  return table.fields.map((field) => {
    return {
      id: getRawTableFieldId(field),
      icon: getColumnIcon(Lib.legacyColumnTypeInfo(field)),
      label: getFieldDisplayName(field),
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
