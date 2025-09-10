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
    //   name: "Security",
    //   to: "/admin/embedding/security",
    // },
    {
      icon: "lock",
      name: "Authentication",
      to: "/admin/settings/authentication",
    },
    {
      icon: "database",
      name: "Databases",
      to: "/admin/databases",
    },
    {
      icon: "person",
      name: "People",
      to: "/admin/people",
    },
    {
      icon: "group",
      name: "Permissions",
      to: "/admin/permissions",
    },
    {
      icon: "palette",
      name: "Appearance",
      to: "/admin/settings/appearance",
    },
  ];

export const getStaticEmbeddingRelatedSettingItems =
  (): RelatedSettingItem[] => [
    {
      icon: "database",
      name: "Databases",
      to: "/admin/databases",
    },
    {
      icon: "palette",
      name: "Appearance",
      to: "/admin/settings/appearance",
    },
  ];

export const getInteractiveEmbeddingRelatedSettingItems =
  (): RelatedSettingItem[] => [
    // TODO: enable this once we've added the "Security" tab to Embedding Settings.
    // {
    //   icon: "shield_outline",
    //   name: "Security",
    //   to: "/admin/embedding/security",
    // },
    {
      icon: "lock",
      name: "Authentication",
      to: "/admin/settings/authentication",
    },
    {
      icon: "database",
      name: "Databases",
      to: "/admin/databases",
    },
    {
      icon: "person",
      name: "People",
      to: "/admin/people",
    },
    {
      icon: "group",
      name: "Permissions",
      to: "/admin/permissions",
    },
    {
      icon: "metabot",
      name: "Metabot",
      to: "/admin/metabot/2",
    },
    {
      icon: "palette",
      name: "Appearance",
      to: "/admin/settings/appearance",
    },
  ];
