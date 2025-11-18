import type { ComponentType, Context, ReactNode } from "react";
import { createContext } from "react";

import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type {
  CheckDependenciesResponse,
  PythonTransformSourceDraft,
  Transform,
  TransformId,
  UpdateSnippetRequest,
  UpdateTransformRequest,
} from "metabase-types/api";
import type { AdminPath } from "metabase-types/store";

export type TransformPickerItem = {
  id: TransformId;
  name: string;
  model: "transform";
};

export type TransformPickerProps = {
  value: TransformPickerItem | undefined;
  onItemSelect: (transform: TransformPickerItem) => void;
};

export type TransformsPlugin = {
  TransformPicker: ComponentType<TransformPickerProps>;
  getAdminPaths(): AdminPath[];
  getAdminRoutes(): ReactNode;
};

export const PLUGIN_TRANSFORMS: TransformsPlugin = {
  TransformPicker: PluginPlaceholder,
  getAdminPaths: () => [],
  getAdminRoutes: () => null,
};

export type PythonTransformEditorProps = {
  name?: string;
  source: PythonTransformSourceDraft;
  proposedSource?: PythonTransformSourceDraft;
  isNew: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onChangeSource: (source: PythonTransformSourceDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
};

export type PythonTransformSourceSectionProps = {
  transform: Transform;
};

export type PythonTransformsPlugin = {
  isEnabled: boolean;
  TransformEditor: ComponentType<PythonTransformEditorProps>;
  SourceSection: ComponentType<PythonTransformSourceSectionProps>;
  PythonRunnerSettingsPage: ComponentType;
  getAdminRoutes: () => ReactNode;
  getTransformsNavLinks: () => ReactNode;
};

export const PLUGIN_TRANSFORMS_PYTHON: PythonTransformsPlugin = {
  isEnabled: false,
  TransformEditor: PluginPlaceholder,
  SourceSection: PluginPlaceholder,
  PythonRunnerSettingsPage: NotFoundPlaceholder,
  getAdminRoutes: () => null,
  getTransformsNavLinks: () => null,
};

type DependenciesPlugin = {
  isEnabled: boolean;
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

export const PLUGIN_DEPENDENCIES: DependenciesPlugin = {
  isEnabled: false,
  DependencyGraphPage: PluginPlaceholder,
  DependencyGraphPageContext: createContext({}),
  CheckDependenciesForm: PluginPlaceholder,
  CheckDependenciesModal: PluginPlaceholder,
  CheckDependenciesTitle: PluginPlaceholder,
  useCheckCardDependencies: useCheckDependencies,
  useCheckSnippetDependencies: useCheckDependencies,
  useCheckTransformDependencies: useCheckDependencies,
};
