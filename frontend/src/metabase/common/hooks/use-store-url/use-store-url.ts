import { useSelector } from "metabase/redux";
import { type StorePaths, getStoreUrl } from "metabase/selectors/settings";

export function useStoreUrl(storePath: StorePaths = "") {
  return useSelector((state) => getStoreUrl(state, storePath));
}
