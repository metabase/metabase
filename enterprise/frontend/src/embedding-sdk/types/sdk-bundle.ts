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
import type { getCollectionNumericIdFromReference } from "embedding-sdk/store/collections";
import type { SdkStore, SdkStoreState } from "embedding-sdk/store/types";
import type { LoginStatus } from "embedding-sdk/types/user";
import type { createDashboard } from "metabase/api/dashboard";
import type { User } from "metabase-types/api";

type HookFunction = () => void;
type ReduxStoreFactory = () => SdkStore;
type ReduxStoreSelector<T> = (state: SdkStoreState) => T;

/**
 * IMPORTANT!
 * Any rename/removal change for object is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
export type MetabaseEmbeddingSdkBundleExports =
  MetabaseEmbeddingSdkBundlePublicExports &
    MetabaseEmbeddingSdkBundleReduxStoreExports &
    MetabaseEmbeddingSdkBundleStoreMutationsExports &
    MetabaseEmbeddingSdkBundleStoreSelectorsExports &
    MetabaseEmbeddingSdkBundleInternalHooksExports;

export type MetabaseEmbeddingSdkBundlePublicExports = {
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
};

export type MetabaseEmbeddingSdkBundleReduxStoreExports = {
  getSdkStore: ReduxStoreFactory;
};

export type MetabaseEmbeddingSdkBundleStoreMutationsExports = {
  createDashboard: typeof createDashboard;
};

export type MetabaseEmbeddingSdkBundleStoreSelectorsExports = {
  getApplicationName: ReduxStoreSelector<string>;
  getAvailableFonts: ReduxStoreSelector<string[]>;
  getCollectionNumericIdFromReference: typeof getCollectionNumericIdFromReference;
  getLoginStatus: ReduxStoreSelector<LoginStatus>;
  getUser: ReduxStoreSelector<User | null>;
};

export type MetabaseEmbeddingSdkBundleInternalHooksExports = {
  useInitData: HookFunction;
  useLogVersionInfo: HookFunction;
};
