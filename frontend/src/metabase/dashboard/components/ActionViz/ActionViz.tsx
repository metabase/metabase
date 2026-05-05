import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationDefinition } from "metabase/visualizations/types";
import type { VisualizationSettings } from "metabase-types/api";

import Action from "./Action";

const isForm = (object: any, computedSettings: VisualizationSettings) =>
  computedSettings.actionDisplayType === "form";

const ActionViz: VisualizationDefinition = {
  getUiName: () => t`Action`,
  identifier: "action",
  iconName: "play",

  noHeader: true,
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
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Action Form Display`,
      widget: "radio",
      hidden: true,
      getProps: () => ({
        options: [
          { name: t`Form`, value: "form" },
          { name: t`Button`, value: "button" },
        ],
      }),
    },
    "button.label": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Label`,
      widget: "input",
      getHidden: isForm,
    },
    "button.variant": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Variant`,
      widget: "select",
      getDefault: () => "primary",
      getHidden: isForm,
      getProps: () => ({
        options: [
          { label: t`Primary`, value: "primary" },
          { label: t`Outline`, value: "default" },
          { label: t`Danger`, value: "danger" },
          { label: t`Success`, value: "success" },
          { label: t`Borderless`, value: "borderless" },
        ],
      }),
    },
  },
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(Action, ActionViz);
