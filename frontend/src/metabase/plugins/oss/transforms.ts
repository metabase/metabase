import type { ComponentType, ReactNode } from "react";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  NotFoundPlaceholder,
  PluginPlaceholder,
} from "metabase/plugins/components/PluginPlaceholder";
import type { PythonTransformSourceDraft, Transform } from "metabase-types/api";

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
  getPythonTransformsRoutes: () => ReactNode;
  getInspectorRoutes: () => ReactNode;
  getPythonSourceValidationResult: (
    source: PythonTransformSourceDraft,
  ) => PythonTransformSourceValidationResult;
  TransformEditor: ComponentType<PythonTransformEditorProps>;
  SourceSection: ComponentType<PythonTransformSourceSectionProps>;
  PythonRunnerSettingsPage: ComponentType;
  getAdminRoutes: () => ReactNode;
  getTransformsNavLinks: () => ReactNode;
  sharedLibImportPath: string;
};

const getDefaultPluginTransforms = (): TransformsPlugin => ({
  isEnabled: true, // transforms are enabled by default in OSS
  TransformsUpsellPage: PluginPlaceholder,
});

export const PLUGIN_TRANSFORMS = getDefaultPluginTransforms();

const getDefaultPluginTransformsPython = (): PythonTransformsPlugin => ({
  isEnabled: false,
  getPythonTransformsRoutes: () => null,
  getInspectorRoutes: () => {
    const {
      getDefaultInspectorRoutes,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require("metabase/transforms/pages/TransformInspectorUpsellPage/routes");
    return getDefaultInspectorRoutes();
  },
  getPythonSourceValidationResult: () => ({ isValid: true }),
  TransformEditor: PluginPlaceholder,
  SourceSection: PluginPlaceholder,
  PythonRunnerSettingsPage: NotFoundPlaceholder,
  getAdminRoutes: () => null,
  getTransformsNavLinks: () => null,
  sharedLibImportPath: "",
});

export const PLUGIN_TRANSFORMS_PYTHON = getDefaultPluginTransformsPython();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_TRANSFORMS, getDefaultPluginTransforms());
  Object.assign(PLUGIN_TRANSFORMS_PYTHON, getDefaultPluginTransformsPython());
}
