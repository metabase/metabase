import { isVirtualCardId } from "metabase/lib/saved-questions/saved-questions";
import type Field from "./Field";
import type Table from "./Table";

export function getUniqueFieldId(id: Field["id"], tableId: Table["id"]) {
  if (isVirtualCardId(tableId)) {
    return `${tableId}:${id}`;
  }

  return id;
}
