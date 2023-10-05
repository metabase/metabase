import { t } from "ttag";
import { useDatabaseListQuery } from "metabase/common/hooks";
import { getHasNativeWrite } from "metabase/selectors/data";

export const NativeQueryLabel = () => {
  const { data: databases = [] } = useDatabaseListQuery();

  const hasNativeWrite = getHasNativeWrite(databases);

  const filterLabel = hasNativeWrite ? t`native` : `SQL`;
  // Search the contents of SQL queries`
  return `Search the contents of ${filterLabel} queries`;
};
