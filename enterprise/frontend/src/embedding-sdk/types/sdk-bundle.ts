import type { CollectionBrowser } from "embedding-sdk/components/public/CollectionBrowser";
import type { ComponentProvider } from "embedding-sdk/components/public/ComponentProvider";
import type { CreateDashboardModal } from "embedding-sdk/components/public/CreateDashboardModal";
import type { CreateQuestion } from "embedding-sdk/components/public/CreateQuestion";
import type { InteractiveQuestion } from "embedding-sdk/components/public/InteractiveQuestion/InteractiveQuestion";
import type { MetabotQuestion } from "embedding-sdk/components/public/MetabotQuestion";
import type { StaticQuestion } from "embedding-sdk/components/public/StaticQuestion/StaticQuestion";
import type { EditableDashboard } from "embedding-sdk/components/public/dashboard/EditableDashboard";
import type { InteractiveDashboard } from "embedding-sdk/components/public/dashboard/InteractiveDashboard";
import type { StaticDashboard } from "embedding-sdk/components/public/dashboard/StaticDashboard";
import type { SdkDebugInfo } from "embedding-sdk/components/public/debug/SdkDebugInfo";
import type { useInitData } from "embedding-sdk/hooks/private/use-init-data";
import type { useLogVersionInfo } from "embedding-sdk/hooks/private/use-log-version-info";
import type { getSdkStore } from "embedding-sdk/store";
import type { getCollectionNumericIdFromReference } from "embedding-sdk/store/collections";
import type { getLoginStatus } from "embedding-sdk/store/selectors";
import type { createDashboard } from "metabase/api/dashboard";
import type { getSetting } from "metabase/selectors/settings";
import type { getUser } from "metabase/selectors/user";
import type { getApplicationName } from "metabase/selectors/whitelabel";

/**
 * IMPORTANT!
 * Any rename/removal change for object is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
export type MetabaseEmbeddingSdkBundleExports = {
  CollectionBrowser: typeof CollectionBrowser;
  CreateDashboardModal: typeof CreateDashboardModal;
  CreateQuestion: typeof CreateQuestion;
  EditableDashboard: typeof EditableDashboard;
  InteractiveDashboard: typeof InteractiveDashboard;
  InteractiveQuestion: typeof InteractiveQuestion;
  ComponentProvider: typeof ComponentProvider;
  MetabotQuestion: typeof MetabotQuestion;
  SdkDebugInfo: typeof SdkDebugInfo;
  StaticDashboard: typeof StaticDashboard;
  StaticQuestion: typeof StaticQuestion;
  createDashboard: typeof createDashboard;
  getApplicationName: typeof getApplicationName;
  getCollectionNumericIdFromReference: typeof getCollectionNumericIdFromReference;
  getLoginStatus: typeof getLoginStatus;
  getSdkStore: typeof getSdkStore;
  getSetting: typeof getSetting;
  getUser: typeof getUser;
  useInitData: typeof useInitData;
  useLogVersionInfo: typeof useLogVersionInfo;
};
