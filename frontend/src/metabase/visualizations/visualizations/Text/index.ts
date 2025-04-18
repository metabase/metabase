import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import { Text } from "./Text";

const TextWrapper = Object.assign(Text, {
  get uiName() {
    return t`Text`;
  },
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
      get default() {
        return t`Text card`;
      },
    },
    "card.description": {
      dashboard: false,
    },
    text: {
      value: "",
      default: "",
    },
    "text.align_vertical": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Vertical Alignment`;
      },
      widget: "select",
      props: {
        options: [
          {
            get name() {
              return t`Top`;
            },
            value: "top",
          },
          {
            get name() {
              return t`Middle`;
            },
            value: "middle",
          },
          {
            get name() {
              return t`Bottom`;
            },
            value: "bottom",
          },
        ],
      },
      default: "top",
    },
    "text.align_horizontal": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Horizontal Alignment`;
      },
      widget: "select",
      props: {
        options: [
          {
            get name() {
              return t`Left`;
            },
            value: "left",
          },
          {
            get name() {
              return t`Center`;
            },
            value: "center",
          },
          {
            get name() {
              return t`Right`;
            },
            value: "right",
          },
        ],
      },
      default: "left",
    },
    "dashcard.background": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Show background`;
      },
      dashboard: true,
      inline: true,
      widget: "toggle",
      default: true,
    },
  },
});

export { TextWrapper as Text };
