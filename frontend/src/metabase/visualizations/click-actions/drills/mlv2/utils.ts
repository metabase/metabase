import type { RowValue } from "metabase-types/api";

export function getObjectDetailsActionExtraData({
  objectId,
  isManyPks,
}: {
  objectId: RowValue;
  isManyPks: boolean;
}) {
  if (!isManyPks) {
    return {
      extra: () => ({ objectId }),
    };
  }
}
