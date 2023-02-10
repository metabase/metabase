import { t } from "ttag";

export interface LinkCardSettings {
  "card.title": string;
  "card.description": string;
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
  "link.align_vertical": "top" | "middle" | "bottom";
  "link.align_horizontal": "left" | "center" | "right";
}

export const settings = {
  uiName: "Link",
  identifier: "link",
  iconName: "link",
  disableSettingsConfig: false,
  noHeader: true,
  supportsSeries: false,
  hidden: true,
  supportPreviewing: true,
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
        entity: {
          type: "",
          id: "",
        },
      },
      default: {
        url: "https://metabase.com",
      },
    },
    "link.align_vertical": {
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
      default: "middle",
    },
    "link.align_horizontal": {
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
      default: "center",
    },
  },
  preventDragging: (e: React.SyntheticEvent) => e.stopPropagation(),
};

export const getSettingsStyle = (settings: LinkCardSettings) => {
  const flexProps = {
    left: "flex-start",
    right: "flex-end",
    center: "center",
    middle: "center",
    top: "flex-start",
    bottom: "flex-end",
  };

  const horizontalSetting = settings["link.align_horizontal"];
  const verticalSetting = settings["link.align_vertical"];

  return /* css */ `
    justify-content: ${flexProps[horizontalSetting] ?? "center"};
    align-items: ${flexProps[verticalSetting] ?? "center"};
  `;
};
