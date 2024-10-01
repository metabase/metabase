import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

export const settings = {
  uiName: "iframe",
  canSavePng: false,
  identifier: "iframe",
  iconName: "link",
  disableSettingsConfig: true,
  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: true,
  minSize: getMinSize("iframe"),
  defaultSize: getDefaultSize("iframe"),
  checkRenderable: () => {},
  settings: {
    "card.title": {
      dashboard: false,
      default: t`iFrame card`,
    },
    "card.description": {
      dashboard: false,
    },
    iframe: {
      value: "",
      default: "",
    },
  },
};
