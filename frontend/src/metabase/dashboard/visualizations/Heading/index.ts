import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";

import { Heading } from "./Heading";

const HeadingViz: VisualizationDefinition = {
  getUiName: () => t`Heading`,
  identifier: "heading",
  iconName: "empty",
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
};

const HeadingWrapper = Object.assign(Heading, HeadingViz);

export { HeadingWrapper as Heading };
