import type { JSXElementConstructor } from "react";

import type { CollectionBrowser } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import type { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import type { CreateDashboardModal } from "embedding-sdk-bundle/components/public/CreateDashboardModal";
import type { CreateQuestion } from "embedding-sdk-bundle/components/public/CreateQuestion";
import type { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion/InteractiveQuestion";
import type { MetabotQuestion } from "embedding-sdk-bundle/components/public/MetabotQuestion";
import type { SdkDebugInfo } from "embedding-sdk-bundle/components/public/SdkDebugInfo/SdkDebugInfo";
import type { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion/StaticQuestion";
import type { EditableDashboard } from "embedding-sdk-bundle/components/public/dashboard/EditableDashboard";
import type { InteractiveDashboard } from "embedding-sdk-bundle/components/public/dashboard/InteractiveDashboard";
import type { StaticDashboard } from "embedding-sdk-bundle/components/public/dashboard/StaticDashboard";
import type { SdkStore, SdkStoreState } from "embedding-sdk-bundle/store/types";
import type {
  CreateDashboardValues,
  MetabaseDashboard,
} from "embedding-sdk-bundle/types";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";
import type { FunctionSchemaValidationResult } from "embedding-sdk-shared/types/validation";
import type { User } from "metabase-types/api";

export type InternalComponent<TComponent extends JSXElementConstructor<any>> =
  TComponent & { schema?: any };
type InternalHook = () => void;
type ReduxStoreFactory = () => SdkStore;
type ReduxStoreSelector<T> = (state: SdkStoreState) => T;
type ReduxStoreUtilityFunction<
  TFunctionSignature extends (...params: any[]) => any,
> = (store: SdkStore) => TFunctionSignature;

/**
 * IMPORTANT!
 * Any rename/removal change for object is a breaking change between the SDK Bundle and the SDK NPM package,
 * and should be done via the deprecation of the field first.
 */
export type MetabaseEmbeddingSdkBundleExports = PublicExports &
  ReduxStoreExports &
  ReduxStoreUtilityFunctionExports &
  ReduxStoreSelectorsExports &
  InternalHooksExports &
  SchemaValidationUtils;

export type PublicExports = {
  CollectionBrowser: InternalComponent<typeof CollectionBrowser>;
  CreateDashboardModal: InternalComponent<typeof CreateDashboardModal>;
  CreateQuestion: InternalComponent<typeof CreateQuestion>;
  EditableDashboard: InternalComponent<typeof EditableDashboard>;
  InteractiveDashboard: InternalComponent<typeof InteractiveDashboard>;
  InteractiveQuestion: InternalComponent<typeof InteractiveQuestion>;
  ComponentProvider: InternalComponent<typeof ComponentProvider>;
  MetabotQuestion: InternalComponent<typeof MetabotQuestion>;
  SdkDebugInfo: InternalComponent<typeof SdkDebugInfo>;
  StaticDashboard: InternalComponent<typeof StaticDashboard>;
  StaticQuestion: InternalComponent<typeof StaticQuestion>;
};

export type ReduxStoreExports = {
  getSdkStore: ReduxStoreFactory;
};

export type ReduxStoreUtilityFunctionExports = {
  createDashboard: ReduxStoreUtilityFunction<
    (params: CreateDashboardValues) => Promise<MetabaseDashboard>
  >;
};

export type ReduxStoreSelectorsExports = {
  getApplicationName: ReduxStoreSelector<string>;
  getAvailableFonts: ReduxStoreSelector<string[]>;
  getLoginStatus: ReduxStoreSelector<LoginStatus>;
  getUser: ReduxStoreSelector<User | null>;
};

export type InternalHooksExports = {
  useInitData: InternalHook;
  useLogVersionInfo: InternalHook;
};

export type SchemaValidationUtils = {
  validateFunctionSchema: (
    schema: any,
  ) => FunctionSchemaValidationResult<unknown[], unknown>;
};
