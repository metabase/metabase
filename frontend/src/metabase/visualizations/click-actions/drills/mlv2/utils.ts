import type { RowValue } from "metabase-types/api";

export function getObjectDetailsActionExtraData({
  objectId,
  hasManyPKColumns,
}: {
  objectId: RowValue;
  hasManyPKColumns: boolean;
}) {
  if (!hasManyPKColumns) {
    return {
      extra: () => ({ objectId }),
    };
  }
}
