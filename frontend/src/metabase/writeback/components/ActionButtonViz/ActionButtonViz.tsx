import { t } from "ttag";
import ActionButton from "./ActionButton";

export default Object.assign(ActionButton, {
  uiName: t`Action button`,
  identifier: "action-button",
  iconName: "play",

  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: false,

  minSize: { width: 2, height: 1 },

  checkRenderable: () => true,
  isSensible: () => false,

  settings: {
    "card.title": {
      dashboard: false,
    },
    "card.description": {
      dashboard: false,
    },
    "button.label": {
      section: t`Display`,
      title: t`Label`,
      widget: "input",
      default: "Click Me",
    },
    "button.variant": {
      section: t`Display`,
      title: t`Variant`,
      widget: "select",
      default: "default",
      props: {
        options: [
          { name: t`Default`, value: "default" },
          { name: t`Primary`, value: "primary" },
          { name: t`Danger`, value: "danger" },
          { name: t`Success`, value: "success" },
          { name: t`Borderless`, value: "borderless" },
        ],
      },
    },
  },
});
