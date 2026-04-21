import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";

export const settings: VisualizationDefinition = {
  getUiName: () => "iframe",
  canSavePng: false,
  identifier: "iframe",
  iconName: "link",
  disableSettingsConfig: true,
  noHeader: true,
  hidden: true,
  supportPreviewing: true,
  minSize: getMinSize("iframe"),
  defaultSize: getDefaultSize("iframe"),
  checkRenderable: () => {},
  settings: {
    "card.title": {
      dashboard: false,
      getDefault() {
        return t`Iframe card`;
      },
    },
    "card.description": {
      dashboard: false,
    },
    iframe: {
      value: "",
      getDefault: () => "",
    },
  },
};
