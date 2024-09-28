import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

export const settings = {
  uiName: "Embed",
  canSavePng: false,
  identifier: "embed",
  iconName: "link",
  disableSettingsConfig: true,
  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: true,
  minSize: getMinSize("embed"),
  defaultSize: getDefaultSize("embed"),
  checkRenderable: () => {},
  settings: {
    "card.title": {
      dashboard: false,
      default: t`Embed card`,
    },
    "card.description": {
      dashboard: false,
    },
    embed: {
      value: "",
      default: "",
    },
  },
  preventDragging: (e: React.SyntheticEvent) => e.stopPropagation(),
};
