import { t } from "ttag";

import type { IconName } from "metabase/ui";

export interface RelatedSettingItem {
  icon: IconName;
  name: string;
  to: string;
}

export const getModularEmbeddingRelatedSettingItems =
  (): RelatedSettingItem[] => [
    {
      icon: "shield_outline",
      name: t`Security`,
      to: "/admin/embedding/security",
    },
    {
      icon: "lock",
      name: t`Authentication`,
      to: "/admin/settings/authentication",
    },
    {
      icon: "database",
      name: t`Databases`,
      to: "/admin/databases",
    },
    {
      icon: "person",
      name: t`People`,
      to: "/admin/people",
    },
    {
      icon: "group",
      name: t`Permissions`,
      to: "/admin/permissions",
    },
    {
      icon: "palette",
      name: t`Appearance`,
      to: "/admin/settings/appearance",
    },
  ];

export const getGuestEmbedsRelatedSettingItems = (): RelatedSettingItem[] => [
  {
    icon: "shield_outline",
    name: t`Security`,
    to: "/admin/embedding/security",
  },
  {
    icon: "database",
    name: t`Databases`,
    to: "/admin/databases",
  },
  {
    icon: "person",
    name: t`People`,
    to: "/admin/people",
  },
  {
    icon: "group",
    name: t`Permissions`,
    to: "/admin/permissions",
  },
  {
    icon: "palette",
    name: t`Appearance`,
    to: "/admin/settings/appearance",
  },
];
