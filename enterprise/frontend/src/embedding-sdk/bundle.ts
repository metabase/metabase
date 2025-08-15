/* eslint-disable import/order */

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Enable SDK mode as we are in the SDK bundle
// This applies to SDK derivatives such as new iframe embedding.
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import "metabase/css/vendor.css";
import "metabase/css/index.module.css";

import "metabase/lib/dayjs";

// Import the EE plugins required by the embedding sdk.
import "sdk-ee-plugins";

// Imports which are only applicable to the embedding sdk, and not the new iframe embedding.
import "sdk-specific-imports";

import type { MetabaseEmbeddingSdkBundleExports } from "./types/sdk-bundle";

// Components
import { CollectionBrowser } from "./components/public/CollectionBrowser";
import { CreateDashboardModal } from "./components/public/CreateDashboardModal";
import { CreateQuestion } from "./components/public/CreateQuestion";
import { InteractiveQuestion } from "./components/public/InteractiveQuestion";
import { MetabaseProvider } from "./components/public/MetabaseProvider";
import { MetabotQuestion } from "./components/public/MetabotQuestion";
import { StaticQuestion } from "./components/public/StaticQuestion";
import {
  EditableDashboard,
  InteractiveDashboard,
  StaticDashboard,
} from "./components/public/dashboard";
import { SdkDebugInfo } from "./components/public/debug/SdkDebugInfo";

// Exports needed for public Hooks that use sdk redux store
import { createDashboard } from "metabase/api/dashboard";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getCollectionNumericIdFromReference } from "embedding-sdk/store/collections";
import { getSdkStore } from "./store/index";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import { useInitData } from "./hooks/private/use-init-data";

/**
 * IMPORTANT!
 * Any rename/removal change for object is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
const sdkBundleExports: MetabaseEmbeddingSdkBundleExports = {
  CollectionBrowser: CollectionBrowser,
  CreateDashboardModal: CreateDashboardModal,
  CreateQuestion: CreateQuestion,
  EditableDashboard: EditableDashboard,
  InteractiveDashboard: InteractiveDashboard,
  InteractiveQuestion: InteractiveQuestion,
  MetabaseProvider: MetabaseProvider,
  MetabotQuestion: MetabotQuestion,
  SdkDebugInfo: SdkDebugInfo,
  StaticDashboard: StaticDashboard,
  StaticQuestion: StaticQuestion,
  createDashboard: createDashboard,
  getApplicationName: getApplicationName,
  getCollectionNumericIdFromReference: getCollectionNumericIdFromReference,
  getLoginStatus: getLoginStatus,
  getSdkStore: getSdkStore,
  getSetting: getSetting,
  getUser: getUser,
  useInitData: useInitData,
};

window.MetabaseEmbeddingSDK = sdkBundleExports;
