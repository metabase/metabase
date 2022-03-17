import { t } from "ttag";

export const DOWNLOAD_PERMISSION_REQUIRES_DATA_ACCESS = t`Download results access requires full data access.`;

export const DOWNLOAD_PERMISSION_OPTIONS = {
  none: {
    label: t`No`,
    value: "none",
    icon: "close",
    iconColor: "danger",
  },
  limited: {
    label: t`10 thousand rows`,
    value: "limited",
    icon: "10k",
    iconColor: "accent7",
  },
  full: {
    label: t`1 million rows`,
    value: "full",
    icon: "1m",
    iconColor: "accent7",
  },
  controlled: {
    label: t`Granular`,
    value: "controlled",
    icon: "permissions_limited",
    iconColor: "warning",
  },
};

export const DATA_COLUMNS = [
  {
    name: t`Download results`,
    hint: t`If you grant someone permissions to download data from a database, you won't be able to schema or table level for native queries.`,
  },
];
