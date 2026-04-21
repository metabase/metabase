import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";

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
      value: {
        url: "",
      },
      getDefault: () => ({
        url: "",
      }),
    },
  },
};
