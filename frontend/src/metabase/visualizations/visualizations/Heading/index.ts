import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import { Heading } from "./Heading";

const HeadingWrapper = Object.assign(Heading, {
  getUiName: () => t`Heading`,
  identifier: "heading",
  iconName: "heading",
  canSavePng: false,

  noHeader: true,
  hidden: true,
  disableSettingsConfig: true,
  supportPreviewing: false,

  minSize: getMinSize("heading"),
  defaultSize: getDefaultSize("heading"),

  checkRenderable: () => {
    // heading can always be rendered, nothing needed here
  },

  settings: {
    "card.title": {
      dashboard: false,
      getDefault: () => t`Heading card`,
    },
    "card.description": {
      dashboard: false,
    },
    text: {
      value: "",
      getDefault: () => "",
    },
    "dashcard.background": {
      getDefault: () => false,
    },
  },
});

export { HeadingWrapper as Heading };
