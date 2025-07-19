import { useSelector } from "metabase/lib/redux";
import {
  type StorePaths,
  getStoreUrlFromState,
} from "metabase/selectors/settings";

export function useStoreUrl(storePath: StorePaths = "") {
  return useSelector((state) => getStoreUrlFromState(state, storePath));
}
