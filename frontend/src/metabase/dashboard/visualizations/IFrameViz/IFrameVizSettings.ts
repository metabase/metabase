import { t } from "ttag";

import {
  type VisualizationDefinition,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";

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
      getDefault: () => "",
    },
  },
};
