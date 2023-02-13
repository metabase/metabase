import { t } from "ttag";
import type { SearchEntity } from "metabase-types/api/search";

export interface LinkCardSettings {
  link: {
    url?: string;
    entity?: SearchEntity;
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
