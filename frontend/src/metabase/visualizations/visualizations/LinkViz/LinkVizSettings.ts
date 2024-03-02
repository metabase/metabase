import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

export const settings = {
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
      value: {
        url: "",
      },
      default: {
        url: "",
      },
    },
  },
  preventDragging: (e: React.SyntheticEvent) => e.stopPropagation(),
};
