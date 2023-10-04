import { t } from "ttag";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationProperties } from "metabase/visualizations/types";

export const settings: VisualizationProperties = {
  uiName: "Link",
  canSavePng: false,
  identifier: "link",
  iconName: "link",
  disableSettingsConfig: true,
  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: false,
  minSize: getMinSize("link"),
  defaultSize: getDefaultSize("link"),
  checkRenderable: () => undefined,
  settings: {
    "card.title": {
      dashboard: false,
      default: t`Link card`,
    },
    "card.description": {
      dashboard: false,
    },
    link: {
      default: {
        url: "",
      },
    },
  },
};
