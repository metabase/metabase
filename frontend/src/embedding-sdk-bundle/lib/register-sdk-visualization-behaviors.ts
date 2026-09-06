import _ from "underscore";

import {
  convertLinkColumnToClickBehavior,
  removeInternalClickBehaviors,
} from "embedding-sdk-bundle/lib/links";
import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import {
  type ComputedVisualizationSettings,
  type SettingsExtra,
  setComputedSettingsTransform,
  setTooltipRootProvider,
} from "metabase/viz-core";

function transformComputedSettingsForSdk(
  computedSettings: ComputedVisualizationSettings,
  extra: SettingsExtra,
): ComputedVisualizationSettings {
  const shouldKeepInternalClickBehavior = extra.enableEntityNavigation;

  return _.compose(
    shouldKeepInternalClickBehavior ? _.identity : removeInternalClickBehaviors,
    convertLinkColumnToClickBehavior,
  )(computedSettings);
}

export function registerSdkVisualizationBehaviors() {
  setComputedSettingsTransform(transformComputedSettingsForSdk);
  setTooltipRootProvider(() =>
    document.getElementById(EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID),
  );
}
