import { type StorePaths, getStoreUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/utils/redux";

export function useStoreUrl(storePath: StorePaths = "") {
  return useSelector((state) => getStoreUrl(state, storePath));
}
