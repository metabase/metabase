import { t } from "ttag";

import {
  type VisualizationDefinition,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";

import { _columnSettings as columnSettings, settings } from "./settings";
import { checkRenderable, isSensible } from "./utils";

export const PIVOT_TABLE_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Pivot Table`,
  identifier: "pivot",
  iconName: "pivot_table",
  noSizeTier: true,
  minSize: getMinSize("pivot"),
  defaultSize: getDefaultSize("pivot"),
  canSavePng: false,
  isSensible,
  checkRenderable,
  settings,
  columnSettings,
  isLiveResizable: () => false,
};
