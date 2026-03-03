import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import {
  type VisualizationDefinition,
  toVisualizationSettingsDefinitions,
} from "metabase/visualizations/types";

import { Heading as HeadingComponent } from "./Heading";

const HEADING_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Heading`,
  identifier: "heading",
  iconName: "string",
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
  isSensible: () => false,

  settings: toVisualizationSettingsDefinitions({
    "card.title": {
      dashboard: false,
      // eslint-disable-next-line ttag/no-module-declaration
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
  }),
};

export const HeadingViz = Object.assign(HeadingComponent, HEADING_DEFINITION);

export { HeadingComponent as Heading };
