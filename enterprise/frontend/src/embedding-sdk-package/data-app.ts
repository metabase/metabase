// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { defineBuildInfo } from "metabase/embedding-sdk/lib/define-build-info";
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { defineGlobalDependencies } from "metabase/embedding-sdk/lib/define-global-dependencies";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

defineBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO");
defineGlobalDependencies();

export { DataAppRouter } from "./components/public/DataAppRouter";
export { DataAppLink } from "./components/public/DataAppLink";
export { useDataAppLocation } from "./hooks/public/use-data-app-location";
export {
  breakout,
  createMetabaseQuery,
  filter,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "./hooks/public/use-metabase-query";
export type {
  MetabaseBreakout,
  MetabaseQueryOptions,
  UseMetabaseQueryResult,
} from "./hooks/public/use-metabase-query";
