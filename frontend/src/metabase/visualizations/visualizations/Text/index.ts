import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import { Text } from "./Text";

const TextWrapper = Object.assign(Text, {
  getUiName: () => t`Text`,
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
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Vertical Alignment`,
      widget: "select",
      props: {
        options: [
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          { name: t`Top`, value: "top" },
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          { name: t`Middle`, value: "middle" },
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          { name: t`Bottom`, value: "bottom" },
        ],
      },
      default: "top",
    },
    "text.align_horizontal": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Horizontal Alignment`,
      widget: "select",
      props: {
        options: [
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          { name: t`Left`, value: "left" },
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          { name: t`Center`, value: "center" },
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          { name: t`Right`, value: "right" },
        ],
      },
      default: "left",
    },
    "dashcard.background": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Show background`,
      dashboard: true,
      inline: true,
      widget: "toggle",
      default: true,
    },
  },
});

export { TextWrapper as Text };
