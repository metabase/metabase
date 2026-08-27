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

// SmartLink and the metabot suggestion message call these hooks unconditionally,
// so the registration must run before the app renders.
export function registerTransformQueryHooks() {
  PLUGIN_TRANSFORMS.useGetTransformQuery = useGetTransformQuery;
  PLUGIN_TRANSFORMS.useLazyGetTransformQuery = useLazyTransformQuery;
}
