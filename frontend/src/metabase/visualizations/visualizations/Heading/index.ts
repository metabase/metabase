import { t } from "ttag";

import { GRID_WIDTH } from "metabase/lib/dashboard_grid";
import { Heading } from "./Heading";

const HeadingWrapper = Object.assign(Heading, {
  uiName: t`Heading`,
  identifier: "heading",
  iconName: "heading",
  canSavePng: false,

  noHeader: true,
  hidden: true,
  disableSettingsConfig: true,
  supportPreviewing: false,
  supportsSeries: false,

  minSize: { width: 1, height: 1 },
  defaultSize: { width: GRID_WIDTH, height: 1 },

  checkRenderable: () => {
    // heading can always be rendered, nothing needed here
  },

  settings: {
    "card.title": {
      dashboard: false,
      default: t`Heading card`,
    },
    "card.description": {
      dashboard: false,
    },
    text: {
      value: "",
      default: "",
    },
    "dashcard.background": {
      default: false,
    },
  },
});

export { HeadingWrapper as Heading };
