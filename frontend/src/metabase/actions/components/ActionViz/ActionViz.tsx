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
      props: {
        options: [
          /* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
          { name: t`Form`, value: "form" },
          /* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
          { name: t`Button`, value: "button" },
        ],
      },
    },
    "button.label": {
      section: t`Display`,
      title: t`Label`,
      widget: "input",
      getHidden: isForm,
    },
    "button.variant": {
      section: t`Display`,
      title: t`Variant`,
      widget: "select",
      default: "primary",
      getHidden: isForm,
      props: {
        options: [
          /* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
          { label: t`Primary`, value: "primary" },
          /* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
          { label: t`Outline`, value: "default" },
          /* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
          { label: t`Danger`, value: "danger" },
          /* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
          { label: t`Success`, value: "success" },
          /* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
          { label: t`Borderless`, value: "borderless" },
        ],
      },
    },
  },
});
