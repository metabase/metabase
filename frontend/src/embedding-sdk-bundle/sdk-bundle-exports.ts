// oxfmt-ignore
import type { MetabaseEmbeddingSdkBundleExports } from "./types/sdk-bundle";

// oxfmt-ignore
import { MetabotSubscriber } from "./components/private/MetabotSubscriber/MetabotSubscriber";
// oxfmt-ignore
import { SdkThemeProvider } from "./components/private/SdkThemeProvider";
// oxfmt-ignore
import { CollectionBrowser } from "./components/public/CollectionBrowser";
// oxfmt-ignore
import { CreateDashboardModal } from "./components/public/CreateDashboardModal";
// oxfmt-ignore
import { CreateQuestion } from "./components/public/CreateQuestion";
// oxfmt-ignore
import { InteractiveQuestion } from "./components/public/InteractiveQuestion";
// oxfmt-ignore
import { ComponentProvider } from "./components/public/ComponentProvider";
// oxfmt-ignore
import { MetabotQuestion } from "./components/public/MetabotQuestion";
// oxfmt-ignore
import { StaticQuestion } from "./components/public/StaticQuestion";
// oxfmt-ignore
import {
  EditableDashboard,
  InteractiveDashboard,
  StaticDashboard,
} from "./components/public/dashboard";
// oxfmt-ignore
import { SdkDebugInfo } from "./components/public/SdkDebugInfo";
// oxfmt-ignore
import { getApplicationName } from "metabase/selectors/whitelabel";
// oxfmt-ignore
import { getSdkStore } from "./store/index";
// oxfmt-ignore
import {
  getAvailableFonts,
  getLoginStatus,
} from "embedding-sdk-bundle/store/selectors";
// oxfmt-ignore
import { getUser } from "metabase/selectors/user";
// oxfmt-ignore
import { useInitData } from "./hooks/private/use-init-data";
// oxfmt-ignore
import { useLogVersionInfo } from "embedding-sdk-bundle/hooks/private/use-log-version-info";
// oxfmt-ignore
import { createDashboard } from "embedding-sdk-bundle/lib/create-dashboard";
// oxfmt-ignore
import { executeAction } from "embedding-sdk-bundle/lib/execute-action";
// oxfmt-ignore
import { resolveDatasetQuery } from "embedding-sdk-bundle/lib/create-metabase-query";
// oxfmt-ignore
import { queryDataset } from "embedding-sdk-bundle/lib/query-dataset";
// oxfmt-ignore
import { queryQuestion } from "embedding-sdk-bundle/lib/query-question";
// oxfmt-ignore
import { validateFunctionSchema } from "embedding-sdk-bundle/lib/validate-function-schema";
// oxfmt-ignore
import {
  DataAppLink,
  DataAppRouter,
  dataAppRouting,
} from "embedding-sdk-bundle/lib/data-app/router";

/**
 * IMPORTANT!
 * Any rename/removal change for object is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
export const sdkBundleExports: MetabaseEmbeddingSdkBundleExports = {
  CollectionBrowser,
  CreateDashboardModal,
  CreateQuestion,
  DataAppLink,
  DataAppRouter,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  ComponentProvider,
  MetabotQuestion,
  SdkDebugInfo,
  StaticDashboard,
  StaticQuestion,
  getSdkStore,
  resolveDatasetQuery,
  createDashboard,
  getApplicationName,
  getAvailableFonts,
  getLoginStatus,
  getUser,
  useInitData,
  useLogVersionInfo,
  validateFunctionSchema,
  MetabotSubscriber,
  SdkThemeProvider,
  queryDataset,
  queryQuestion,
  dataAppRouting,
  executeAction,
};
