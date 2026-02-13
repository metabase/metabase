import type { ComponentType, Context, ReactNode } from "react";
import { createContext } from "react";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type {
  CheckDependenciesResponse,
  GetDependencyGraphRequest,
  PythonTransformSourceDraft,
  Transform,
  UpdateSnippetRequest,
  UpdateTransformRequest,
} from "metabase-types/api";

// Types
export type TransformPickerItem = OmniPickerItem & {
  model: "transform";
};

export type TransformPickerProps = {
  value: TransformPickerItem | undefined;
  onItemSelect: (transform: TransformPickerItem) => void;
};

export type TransformsPlugin = {
  isEnabled: boolean;
  TransformsUpsellPage: ComponentType;
};

export type PythonTransformEditorUiOptions = {
  canChangeDatabase?: boolean;
  readOnly?: boolean;
  hidePreview?: boolean;
  hideRunButton?: boolean;
};

export type PythonTransformEditorProps = {
  source: PythonTransformSourceDraft;
  proposedSource?: PythonTransformSourceDraft;
  uiOptions?: PythonTransformEditorUiOptions;
  isEditMode?: boolean;
  transform?: Transform;
  readOnly?: boolean;
  onChangeSource: (source: PythonTransformSourceDraft) => void;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
  onRunTransform?: (result: any) => void;
  /** Custom run handler that overrides internal test-run. Used in workspace context for dry-run. */
  onRun?: () => void;
};

export type PythonTransformSourceSectionProps = {
  transform: Transform;
};

export type PythonTransformSourceValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

export type PythonTransformsUpsellModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export type PythonTransformsPlugin = {
  isEnabled: boolean;
  getPythonLibraryRoutes: () => ReactNode;
  getPythonSourceValidationResult: (
    source: PythonTransformSourceDraft,
  ) => PythonTransformSourceValidationResult;
  TransformEditor: ComponentType<PythonTransformEditorProps>;
  SourceSection: ComponentType<PythonTransformSourceSectionProps>;
  PythonRunnerSettingsPage: ComponentType;
  getAdminRoutes: () => ReactNode;
  getTransformsNavLinks: () => ReactNode;
  sharedLibImportPath: string;
  PythonTransformsUpsellModal: ComponentType<PythonTransformsUpsellModalProps>;
};

type DependenciesPlugin = {
  isEnabled: boolean;
  getDataStudioDependencyRoutes: () => ReactNode;
  getDataStudioDependencyDiagnosticsRoutes: () => ReactNode;
  DependencyGraphPage: ComponentType;
  DependencyGraphPageContext: Context<DependencyGraphPageContextType>;
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

const getDefaultPluginTransforms = (): TransformsPlugin => ({
  isEnabled: true, // transforms are enabled by default in OSS
  TransformsUpsellPage: PluginPlaceholder,
});

export const PLUGIN_TRANSFORMS = getDefaultPluginTransforms();

const getDefaultPluginTransformsPython = (): PythonTransformsPlugin => ({
  isEnabled: false,
  getPythonLibraryRoutes: () => null,
  getPythonSourceValidationResult: () => ({ isValid: true }),
  TransformEditor: PluginPlaceholder,
  SourceSection: PluginPlaceholder,
  PythonRunnerSettingsPage: NotFoundPlaceholder,
  getAdminRoutes: () => null,
  getTransformsNavLinks: () => null,
  sharedLibImportPath: "",
  PythonTransformsUpsellModal: PluginPlaceholder,
});

export const PLUGIN_TRANSFORMS_PYTHON = getDefaultPluginTransformsPython();

const getDefaultPluginDependencies = (): DependenciesPlugin => ({
  isEnabled: false,
  getDataStudioDependencyRoutes: () => null,
  getDataStudioDependencyDiagnosticsRoutes: () => null,
  DependencyGraphPage: PluginPlaceholder,
  DependencyGraphPageContext: createContext({}),
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
  Object.assign(PLUGIN_TRANSFORMS, getDefaultPluginTransforms());
  Object.assign(PLUGIN_TRANSFORMS_PYTHON, getDefaultPluginTransformsPython());
  Object.assign(PLUGIN_DEPENDENCIES, getDefaultPluginDependencies());
}
