import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";

import { Text } from "./Text";

const TextViz: VisualizationDefinition = {
  getUiName: () => t`Text`,
  identifier: "text",
  iconName: "empty",
  canSavePng: false,

  disableSettingsConfig: false,
  noHeader: true,
  hidden: true,
  supportPreviewing: false,

  minSize: getMinSize("text"),
  defaultSize: getDefaultSize("text"),

  checkRenderable: () => {
    // text can always be rendered, nothing needed here
  },

  settings: {
    "card.title": {
      dashboard: false,
      getDefault: () => t`Text card`,
    },
    "card.description": {
      dashboard: false,
    },
    text: {
      value: "",
      getDefault: () => "",
    },
    "text.align_vertical": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Vertical Alignment`,
      widget: "select",
      getProps: () => ({
        options: [
          { name: t`Top`, value: "top" },
          { name: t`Middle`, value: "middle" },
          { name: t`Bottom`, value: "bottom" },
        ],
      }),
      getDefault: () => "top",
    },
    "text.align_horizontal": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Horizontal Alignment`,
      widget: "select",
      getProps: () => ({
        options: [
          { name: t`Left`, value: "left" },
          { name: t`Center`, value: "center" },
          { name: t`Right`, value: "right" },
        ],
      }),
      getDefault: () => "left",
    },
    "dashcard.background": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Show background`,
      dashboard: true,
      inline: true,
      widget: "toggle",
      getDefault: () => true,
    },
  },
};

const TextWrapper = Object.assign(Text, TextViz);

export { TextWrapper as Text };
