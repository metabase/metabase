import { t } from "ttag";
import Action from "./Action";

export default Object.assign(Action, {
  uiName: t`Action`,
  identifier: "action",
  iconName: "play",

  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: false,

  minSize: { width: 1, height: 1 },

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
      section: t`Display`,
      title: t`Action Form Display`,
      widget: "radio",
      props: {
        options: [
          { name: t`Form`, value: "form" },
          { name: t`Button`, value: "button" },
        ],
      },
    },
    "button.label": {
      section: t`Display`,
      title: t`Label`,
      widget: "input",
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
