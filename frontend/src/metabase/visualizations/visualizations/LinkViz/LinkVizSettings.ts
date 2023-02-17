import { t } from "ttag";

export interface LinkCardSettings {
  link: {
    url?: string;
    entity?: {
      type:
        | "dashboard"
        | "card"
        | "dataset"
        | "collection"
        | "table"
        | "database";
      id: number;
    };
  };
}

export const settings = {
  uiName: "Link",
  identifier: "link",
  iconName: "link",
  disableSettingsConfig: true,
  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: false,
  minSize: { width: 1, height: 1 },
  checkRenderable: () => undefined,
  settings: {
    "card.title": {
      dashboard: false,
      default: t`Link card`,
    },
    "card.description": {
      dashboard: false,
    },
    link: {
      value: {
        url: "",
      },
      default: {
        url: "",
      },
    },
  },
  preventDragging: (e: React.SyntheticEvent) => e.stopPropagation(),
};
