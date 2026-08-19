import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";

import { _columnSettings as columnSettings, settings } from "./settings";
import { checkRenderable, isSensible } from "./utils";

export const PIVOT_TABLE_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Pivot Table`,
  identifier: "pivot",
  iconName: "pivot_table",
  minSize: getMinSize("pivot"),
  defaultSize: getDefaultSize("pivot"),
  canSavePng: false,
  isSensible,
  checkRenderable,
  settings,
  columnSettings,
  isLiveResizable: () => false,
};
