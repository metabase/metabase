import { color } from "metabase/lib/colors";

export const COLLECTION_OPTIONS = [
  {
    displayName: "Collection access",
    name: "access",
    options: [
      {
        label: "Curate",
        value: "write",
        icon: "check",
        iconColor: color("success"),
      },
      {
        label: "View",
        value: "read",
        icon: "eye",
        iconColor: color("warning"),
      },
      {
        label: "No access",
        value: "none",
        icon: "close",
        iconColor: color("danger"),
      },
    ],
  },
];
