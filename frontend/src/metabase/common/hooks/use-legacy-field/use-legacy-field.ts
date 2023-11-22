import { useMemo } from "react";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import LegacyDimension from "metabase-lib/Dimension";

export function useLegacyField(column: Lib.ColumnMetadata) {
  const metadata = useSelector(getMetadata);
  return useMemo(() => {
    const fieldId = Lib._fieldId(column);
    if (typeof fieldId === "number") {
      const tableId = Lib._cardOrTableId(column);
      return metadata.field(fieldId, tableId);
    }
    const fieldRef = Lib.legacyFieldRef(column);
    const dimension = LegacyDimension.parseMBQL(fieldRef, metadata);
    return dimension?.field?.();
  }, [column, metadata]);
}
