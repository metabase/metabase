import type { ComponentType, Context, ReactNode } from "react";
import { createContext } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type {
  CheckDependenciesResponse,
  Database,
  GetDependencyGraphRequest,
  UpdateSnippetRequest,
  UpdateTransformRequest,
} from "metabase-types/api";

// Types
export type DependencyGraphPageContextType = {
  baseUrl?: string;
  defaultEntry?: any;
};

export type CheckDependenciesFormProps = {
  checkData: CheckDependenciesResponse;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
};

export type CheckDependenciesModalProps = {
  checkData: CheckDependenciesResponse;
  opened: boolean;
  onSave: () => void | Promise<void>;
  onClose: () => void;
};

export type UseCheckDependenciesProps<TChange> = {
  onSave: (change: TChange) => Promise<void>;
};

export type UseCheckDependenciesResult<TChange> = {
  checkData?: CheckDependenciesResponse;
  isCheckingDependencies: boolean;
  isConfirmationShown: boolean;
  handleInitialSave: (change: TChange) => Promise<void>;
  handleSaveAfterConfirmation: () => Promise<void>;
  handleCloseConfirmation: () => void;
};

export type DatabaseSchemaViewerSectionProps = {
  database: Database;
};

function useCheckDependencies<TChange>({
  onSave,
}: UseCheckDependenciesProps<TChange>): UseCheckDependenciesResult<TChange> {
  return {
    isConfirmationShown: false,
    isCheckingDependencies: false,
    handleInitialSave: onSave,
    handleSaveAfterConfirmation: () => Promise.resolve(),
    handleCloseConfirmation: () => undefined,
  };
}

type DependenciesPlugin = {
  isEnabled: boolean;
  getDataStudioDependencyRoutes: () => ReactNode;
  getDataStudioDependencyDiagnosticsRoutes: () => ReactNode;
  getDataStudioSchemaViewerRoutes: () => ReactNode;
  DependencyGraphPage: ComponentType;
  DependencyGraphPageContext: Context<DependencyGraphPageContextType>;
  DatabaseSchemaViewerSection: ComponentType<DatabaseSchemaViewerSectionProps>;
  CheckDependenciesForm: ComponentType<CheckDependenciesFormProps>;
  CheckDependenciesModal: ComponentType<CheckDependenciesModalProps>;
  CheckDependenciesTitle: ComponentType;
  useCheckCardDependencies: (
    props: UseCheckDependenciesProps<Question>,
  ) => UseCheckDependenciesResult<Question>;
  useCheckSnippetDependencies: (
    props: UseCheckDependenciesProps<UpdateSnippetRequest>,
  ) => UseCheckDependenciesResult<UpdateSnippetRequest>;
  useCheckTransformDependencies: (
    props: UseCheckDependenciesProps<UpdateTransformRequest>,
  ) => UseCheckDependenciesResult<UpdateTransformRequest>;
  useGetDependenciesCount: (args: GetDependencyGraphRequest) => {
    dependenciesCount: number;
    dependentsCount: number;
  };
};

const getDefaultPluginDependencies = (): DependenciesPlugin => ({
  isEnabled: false,
  getDataStudioDependencyRoutes: () => null,
  getDataStudioDependencyDiagnosticsRoutes: () => null,
  getDataStudioSchemaViewerRoutes: () => null,
  DependencyGraphPage: PluginPlaceholder,
  DependencyGraphPageContext: createContext({}),
  DatabaseSchemaViewerSection: PluginPlaceholder,
  CheckDependenciesForm: PluginPlaceholder,
  CheckDependenciesModal: PluginPlaceholder,
  CheckDependenciesTitle: PluginPlaceholder,
  useCheckCardDependencies: useCheckDependencies,
  useCheckSnippetDependencies: useCheckDependencies,
  useCheckTransformDependencies: useCheckDependencies,
  useGetDependenciesCount: () => ({
    dependenciesCount: 0,
    dependentsCount: 0,
  }),
});

export const PLUGIN_DEPENDENCIES = getDefaultPluginDependencies();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DEPENDENCIES, getDefaultPluginDependencies());
}
