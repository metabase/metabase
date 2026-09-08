import { t } from "ttag";

import {
  type VisualizationDefinition,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";

export const settings: VisualizationDefinition = {
  getUiName: () => "Link",
  canSavePng: false,
  identifier: "link",
  iconName: "link",
  disableSettingsConfig: true,
  noHeader: true,
  hidden: true,
  supportPreviewing: false,
  minSize: getMinSize("link"),
  defaultSize: getDefaultSize("link"),
  checkRenderable: () => undefined,
  settings: {
    "card.title": {
      dashboard: false,
      getDefault() {
        return t`Link card`;
      },
    },
    "card.description": {
      dashboard: false,
    },
    link: {
      getDefault: () => ({
        url: "",
      }),
    },
  },
};
