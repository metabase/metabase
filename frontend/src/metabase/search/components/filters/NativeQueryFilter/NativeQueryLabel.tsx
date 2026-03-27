import { t } from "ttag";

import { canUserCreateNativeQueries } from "metabase/selectors/user";
import { useSelector } from "metabase/utils/redux";

export const NativeQueryLabel = () => {
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const filterLabel = hasNativeWrite ? t`native` : `SQL`;
  return `Search the contents of ${filterLabel} queries`;
};
