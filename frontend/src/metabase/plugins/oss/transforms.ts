import type { ComponentType, ReactNode } from "react";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  PluginPlaceholder,
  pluginPlaceholderRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import type { PythonTransformSourceDraft, Transform } from "metabase-types/api";

import { definePluginSlot } from "../slot";

// Types
export type TransformPickerItem = OmniPickerItem & {
  model: "transform";
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
  onDryRunErrorChange?: (error: string | undefined) => void;
  onRunTransform?: (result: any) => void;
  onRun?: () => void;
};

export type PythonTransformSourceSectionProps = {
  transform: Transform;
};

export type PythonTransformSourceValidationResult = {
  isValid: boolean;
  errorMessage?: string;
};

export type PythonTransformsPlugin = {
  isEnabled: boolean;
  shouldShowInspectTab: boolean;
  getPythonTransformsRoutes: () => ReactNode;
  getInspectorRoutes: () => ReactNode;
  getPythonSourceValidationResult: (
    source: PythonTransformSourceDraft,
  ) => PythonTransformSourceValidationResult;
  TransformEditor: ComponentType<PythonTransformEditorProps>;
  SourceSection: ComponentType<PythonTransformSourceSectionProps>;
  pythonRunnerSettingsPage: PluginRoute;
  getAdminRoutes: () => ReactNode;
  getTransformsNavLinks: () => ReactNode;
  sharedLibImportPath: string;
};

const getDefaultPluginTransforms = (): TransformsPlugin => ({
  isEnabled: true, // transforms are enabled by default in OSS
  TransformsUpsellPage: PluginPlaceholder,
});

export const PLUGIN_TRANSFORMS = definePluginSlot(getDefaultPluginTransforms);

const getDefaultPluginTransformsPython = (): PythonTransformsPlugin => ({
  isEnabled: false,
  shouldShowInspectTab: false,
  getPythonTransformsRoutes: () => null,
  getInspectorRoutes: () => null,
  getPythonSourceValidationResult: () => ({ isValid: true }),
  TransformEditor: PluginPlaceholder,
  SourceSection: PluginPlaceholder,
  pythonRunnerSettingsPage: pluginPlaceholderRoute,
  getAdminRoutes: () => null,
  getTransformsNavLinks: () => null,
  sharedLibImportPath: "",
});

export const PLUGIN_TRANSFORMS_PYTHON = definePluginSlot(
  getDefaultPluginTransformsPython,
);
