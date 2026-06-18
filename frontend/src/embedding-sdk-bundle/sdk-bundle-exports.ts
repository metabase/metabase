/* eslint-disable import/order */

import type { MetabaseEmbeddingSdkBundleExports } from "./types/sdk-bundle";

import { MetabotSubscriber } from "./components/private/MetabotSubscriber/MetabotSubscriber";
import { CollectionBrowser } from "./components/public/CollectionBrowser";
import { CreateDashboardModal } from "./components/public/CreateDashboardModal";
import { CreateQuestion } from "./components/public/CreateQuestion";
import { InteractiveQuestion } from "./components/public/InteractiveQuestion";
import { ComponentProvider } from "./components/public/ComponentProvider";
import { MetabotQuestion } from "./components/public/MetabotQuestion";
import { StaticQuestion } from "./components/public/StaticQuestion";
import {
  EditableDashboard,
  InteractiveDashboard,
  StaticDashboard,
} from "./components/public/dashboard";
import { SdkDebugInfo } from "./components/public/SdkDebugInfo";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getSdkStore } from "./store/index";
import {
  getAvailableFonts,
  getLoginStatus,
} from "embedding-sdk-bundle/store/selectors";
import { getUser } from "metabase/selectors/user";
import { useInitData } from "./hooks/private/use-init-data";
import { useLogVersionInfo } from "embedding-sdk-bundle/hooks/private/use-log-version-info";
import { createDashboard } from "embedding-sdk-bundle/lib/create-dashboard";
import { executeAction } from "embedding-sdk-bundle/lib/execute-action";
import { queryDataset } from "embedding-sdk-bundle/lib/query-dataset";
import { queryMetric } from "embedding-sdk-bundle/lib/query-metric";
import { queryQuestion } from "embedding-sdk-bundle/lib/query-question";
import { validateFunctionSchema } from "embedding-sdk-bundle/lib/validate-function-schema";
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
  createDashboard,
  getApplicationName,
  getAvailableFonts,
  getLoginStatus,
  getUser,
  useInitData,
  useLogVersionInfo,
  validateFunctionSchema,
  MetabotSubscriber,
  queryDataset,
  queryMetric,
  queryQuestion,
  dataAppRouting,
  executeAction,
};
