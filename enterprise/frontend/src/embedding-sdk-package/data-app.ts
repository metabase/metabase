// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { defineBuildInfo } from "metabase/embedding-sdk/lib/define-build-info";
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { defineGlobalDependencies } from "metabase/embedding-sdk/lib/define-global-dependencies";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

defineBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO");
defineGlobalDependencies();

export {
  DataAppRouter,
  type DataAppRouterProps,
} from "./components/public/DataAppRouter";
export {
  DataAppLink,
  type DataAppLinkProps,
} from "./components/public/DataAppLink";
export { DateRangeCalendar } from "./components/public/DateRangeCalendar";
export { DateRangePopover } from "./components/public/DateRangePopover";
export type {
  DateRangeCalendarProps,
  DateRangeValue,
} from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
export type { DateRangePopoverProps } from "embedding-sdk-bundle/components/public/DateRangePopover/DateRangePopover";
export {
  formatDate,
  formatDateRange,
  type FormatDateRangeOptions,
} from "./lib/public/format-date-range";
export { copy } from "./lib/public/copy";
export {
  useDataAppLocation,
  type UseDataAppLocationResult,
} from "./hooks/public/use-data-app-location";
export { defineQuery } from "./hooks/public/use-metabase-query/define-query";
export { defineAction } from "./hooks/public/use-action/define-action";
export {
  aggregations,
  breakout,
  filter,
  orderBy,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "./hooks/public/use-metabase-query";
export type {
  LocalFieldReference,
  MetabaseBreakout,
  MetabaseDynamicColumn,
  MetabaseDynamicQuery,
  MetabaseOrderBy,
  MetabaseQueryOptions,
  MetabaseQueryObject,
  OrderByDirection,
  UseMetabaseQueryObjectResult,
  UseMetabaseQueryResult,
} from "./hooks/public/use-metabase-query";
export type {
  ActionKindFromDataAppSchema,
  ActionParametersFromDataAppSchema,
} from "./hooks/public/use-action";
export type {
  DataAppFactory,
  DataAppMetabaseProviderProps,
} from "metabase-enterprise/data_apps/sandbox/types";
