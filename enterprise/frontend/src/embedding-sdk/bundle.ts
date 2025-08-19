/* eslint-disable import/order */

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Enable SDK mode as we are in the SDK bundle
// This applies to SDK derivatives such as new iframe embedding.
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

// Import the embedding SDK vendors side-effects
import "metabase/embedding-sdk/vendors-side-effects";

// Import the EE plugins required by the embedding sdk.
import "sdk-ee-plugins";

// Imports which are only applicable to the embedding sdk, and not the new iframe embedding.
import "sdk-specific-imports";

import type { MetabaseEmbeddingSdkBundleExports } from "./types/sdk-bundle";

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
import { SdkDebugInfo } from "./components/public/debug/SdkDebugInfo";
import { createDashboard } from "metabase/api/dashboard";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { getCollectionNumericIdFromReference } from "embedding-sdk/store/collections";
import { getSdkStore } from "./store/index";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import { useInitData } from "./hooks/private/use-init-data";
import { useLogVersionInfo } from "embedding-sdk/hooks/private/use-log-version-info";

/**
 * IMPORTANT!
 * Any rename/removal change for object is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
const sdkBundleExports: MetabaseEmbeddingSdkBundleExports = {
  CollectionBrowser,
  CreateDashboardModal,
  CreateQuestion,
  EditableDashboard,
  InteractiveDashboard,
  InteractiveQuestion,
  ComponentProvider,
  MetabotQuestion,
  SdkDebugInfo,
  StaticDashboard,
  StaticQuestion,
  createDashboard,
  getApplicationName,
  getCollectionNumericIdFromReference,
  getLoginStatus,
  getSdkStore,
  getSetting,
  getUser,
  useInitData,
  useLogVersionInfo,
};

window.METABASE_EMBEDDING_SDK_BUNDLE = sdkBundleExports;
