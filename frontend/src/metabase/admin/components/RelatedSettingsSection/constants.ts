import { t } from "ttag";

import type { IconName } from "metabase/ui";

export interface RelatedSettingItem {
  icon: IconName;
  name: string;
  to: string;
}

export const getModularEmbeddingRelatedSettingItems =
  (): RelatedSettingItem[] => [
    // TODO: enable this once we've added the "Security" tab to Embedding Settings.
    // {
    //   icon: "shield_outline",
    //   name: t`Security`,
    //   to: "/admin/embedding/security",
    // },
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

export const getStaticEmbeddingRelatedSettingItems =
  (): RelatedSettingItem[] => [
    {
      icon: "database",
      name: t`Databases`,
      to: "/admin/databases",
    },
    {
      icon: "palette",
      name: t`Appearance`,
      to: "/admin/settings/appearance",
    },
  ];

export const getInteractiveEmbeddingRelatedSettingItems =
  (): RelatedSettingItem[] => [
    // TODO: enable this once we've added the "Security" tab to Embedding Settings.
    // {
    //   icon: "shield_outline",
    //   name: t`Security`,
    //   to: "/admin/embedding/security",
    // },
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
      icon: "metabot",
      name: t`Metabot`,
      to: "/admin/metabot/2",
    },
    {
      icon: "palette",
      name: t`Appearance`,
      to: "/admin/settings/appearance",
    },
  ];
