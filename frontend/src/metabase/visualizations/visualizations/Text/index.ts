import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import { Text } from "./Text";

const TextWrapper = Object.assign(Text, {
  uiName: t`Text`,
  identifier: "text",
  iconName: "text",
  canSavePng: false,

  disableSettingsConfig: false,
  noHeader: true,
  supportsSeries: false,
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
      default: t`Text card`,
    },
    "card.description": {
      dashboard: false,
    },
    text: {
      value: "",
      default: "",
    },
    "text.align_vertical": {
      section: t`Display`,
      title: t`Vertical Alignment`,
      widget: "select",
      props: {
        options: [
          { name: t`Top`, value: "top" },
          { name: t`Middle`, value: "middle" },
          { name: t`Bottom`, value: "bottom" },
        ],
      },
      default: "top",
    },
    "text.align_horizontal": {
      section: t`Display`,
      title: t`Horizontal Alignment`,
      widget: "select",
      props: {
        options: [
          { name: t`Left`, value: "left" },
          { name: t`Center`, value: "center" },
          { name: t`Right`, value: "right" },
        ],
      },
      default: "left",
    },
    "dashcard.background": {
      section: t`Display`,
      title: t`Show background`,
      dashboard: true,
      inline: true,
      widget: "toggle",
      default: true,
    },
  },
});

export { TextWrapper as Text };
