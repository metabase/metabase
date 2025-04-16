import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationSettings } from "metabase-types/api";

import Action from "./Action";

const isForm = (object: any, computedSettings: VisualizationSettings) =>
  computedSettings.actionDisplayType === "form";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(Action, {
  get uiName() {
    return t`Action`;
  },
  identifier: "action",
  iconName: "play",

  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: false,
  disableSettingsConfig: true,
  canSavePng: false,

  minSize: getMinSize("action"),
  defaultSize: getDefaultSize("action"),

  checkRenderable: () => true,
  isSensible: () => false,

  settings: {
    "card.title": {
      dashboard: false,
    },
    "card.description": {
      dashboard: false,
    },
    actionDisplayType: {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Action Form Display`;
      },
      widget: "radio",
      hidden: true,
      props: {
        options: [
          {
            get name() {
              return t`Form`;
            },
            value: "form",
          },
          {
            get name() {
              return t`Button`;
            },
            value: "button",
          },
        ],
      },
    },
    "button.label": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Label`;
      },
      widget: "input",
      getHidden: isForm,
    },
    "button.variant": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Variant`;
      },
      widget: "select",
      default: "primary",
      getHidden: isForm,
      props: {
        options: [
          {
            get name() {
              return t`Primary`;
            },
            value: "primary",
          },
          {
            get name() {
              return t`Outline`;
            },
            value: "default",
          },
          {
            get name() {
              return t`Danger`;
            },
            value: "danger",
          },
          {
            get name() {
              return t`Success`;
            },
            value: "success",
          },
          {
            get name() {
              return t`Borderless`;
            },
            value: "borderless",
          },
        ],
      },
    },
  },
});
