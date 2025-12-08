import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { canUserCreateNativeQueries } from "metabase/selectors/user";

export const NativeQueryLabel = () => {
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const filterLabel = hasNativeWrite ? t`native` : `SQL`;
  return `Search the contents of ${filterLabel} queries`;
};
