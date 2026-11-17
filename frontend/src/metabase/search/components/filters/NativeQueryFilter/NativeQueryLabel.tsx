import { t } from "ttag";

import { canUserCreateNativeQueries } from "metabase/current-user";
import { useSelector } from "metabase/redux";

export const NativeQueryLabel = () => {
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const filterLabel = hasNativeWrite ? t`native` : `SQL`;
  return `Search the contents of ${filterLabel} queries`;
};
