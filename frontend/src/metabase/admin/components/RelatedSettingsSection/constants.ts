import { t } from "ttag";

import { PLUGIN_TENANTS } from "metabase/plugins";
import type { IconName } from "metabase/ui";

export interface RelatedSettingItem {
  icon: IconName;
  name: string;
  to: string;
}

export const getModularEmbeddingRelatedSettingItems = ({
  isUsingTenants,
  hasSimpleEmbedding,
}: {
  isUsingTenants?: boolean;
  hasSimpleEmbedding?: boolean;
}): RelatedSettingItem[] => {
  const isTenantsFeatureAvailable = PLUGIN_TENANTS.isEnabled;

  const items: RelatedSettingItem[] = [
    ...(hasSimpleEmbedding
      ? [
          {
            icon: "shield_outline" as const,
            name: t`Security`,
            to: "/admin/embedding/security",
          },
        ]
      : []),
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
    ...(hasSimpleEmbedding
      ? [
          {
            icon: "palette" as const,
            name: t`Appearance`,
            to: "/admin/settings/appearance",
          },
        ]
      : []),
    ...(isTenantsFeatureAvailable
      ? [
          {
            icon: "globe" as const,
            name: t`Tenants`,
            to: isUsingTenants
              ? "/admin/people/tenants"
              : "/admin/people/user-strategy",
          },
        ]
      : []),
  ];

  return items;
};

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

export const getInteractiveEmbeddingRelatedSettingItems =
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
      icon: "metabot",
      name: t`Embedded Metabot`,
      to: "/admin/metabot/2",
    },
    {
      icon: "palette",
      name: t`Appearance`,
      to: "/admin/settings/appearance",
    },
  ];
