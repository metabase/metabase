import { PLUGIN_TRANSFORMS, type TransformsPlugin } from "metabase/plugins";

import {
  useGetTransformQuery,
  useLazyGetTransformQuery,
} from "./api/transform";

const useLazyTransformQuery: TransformsPlugin["useLazyGetTransformQuery"] =
  () => {
    const [trigger, result] = useLazyGetTransformQuery();
    return [trigger, result];
  };

// The default hooks report a skipped query, so this must run before anything renders.
export function registerTransformQueryHooks() {
  PLUGIN_TRANSFORMS.useGetTransformQuery = useGetTransformQuery;
  PLUGIN_TRANSFORMS.useLazyGetTransformQuery = useLazyTransformQuery;
}
