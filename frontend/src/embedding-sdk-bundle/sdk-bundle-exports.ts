/* eslint-disable import/order */

import { useLogVersionInfo } from "embedding-sdk-bundle/hooks/private/use-log-version-info";
import { createDashboard } from "embedding-sdk-bundle/lib/create-dashboard";
import { resolveDatasetQuery } from "embedding-sdk-bundle/lib/create-metabase-query";
import {
  DataAppLink,
  DataAppRouter,
  dataAppRouting,
} from "embedding-sdk-bundle/lib/data-app/router";
import { executeAction } from "embedding-sdk-bundle/lib/execute-action";
import { queryDataset } from "embedding-sdk-bundle/lib/query-dataset";
import { queryQuestion } from "embedding-sdk-bundle/lib/query-question";
import { validateFunctionSchema } from "embedding-sdk-bundle/lib/validate-function-schema";
import {
  getAvailableFonts,
  getLoginStatus,
} from "embedding-sdk-bundle/store/selectors";
import { getUser } from "metabase/current-user";
import { getApplicationName } from "metabase/selectors/whitelabel";

import { MetabotSubscriber } from "./components/private/MetabotSubscriber/MetabotSubscriber";
import { SdkThemeProviderWithStore } from "./components/private/SdkThemeProvider";
import { CollectionBrowser } from "./components/public/CollectionBrowser";
import { ComponentProvider } from "./components/public/ComponentProvider";
import { CreateDashboardModal } from "./components/public/CreateDashboardModal";
import { CreateQuestion } from "./components/public/CreateQuestion";
import { InteractiveQuestion } from "./components/public/InteractiveQuestion";
import { MetabotQuestion } from "./components/public/MetabotQuestion";
import { SdkDebugInfo } from "./components/public/SdkDebugInfo";
import { StaticQuestion } from "./components/public/StaticQuestion";
import {
  EditableDashboard,
  InteractiveDashboard,
  StaticDashboard,
} from "./components/public/dashboard";
import { useInitData } from "./hooks/private/use-init-data";
import { getSdkStore } from "./store/index";
import type { MetabaseEmbeddingSdkBundleExports } from "./types/sdk-bundle";

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
  SdkThemeProviderWithStore,
  queryDataset,
  queryQuestion,
  dataAppRouting,
  executeAction,
};
