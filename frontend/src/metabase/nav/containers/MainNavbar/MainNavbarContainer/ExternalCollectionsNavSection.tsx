import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import { useTenantsEnabled } from "metabase/nav/prototype/use-tenants-enabled";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Collection } from "metabase-types/api";

import { SidebarHeading, SidebarSection } from "../Sidebar";
import { SidebarLink } from "../SidebarItems";

// PROTOTYPE: mocked shared tenant collections, shown when tenants are
// simulated on but aren't really enabled on this instance.
const MOCK_SHARED_COLLECTIONS = [
  "Customer dashboards",
  "Embedded analytics",
  "Partner reports",
];

type Props = {
  canAccessTenantSpecificCollections: boolean;
  canCreateSharedCollection: boolean;
  sharedTenantCollections: Collection[] | undefined;
};

/** PROTOTYPE: the mocked external collections, without a heading. */
export function MockExternalCollectionsList() {
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <>
      {MOCK_SHARED_COLLECTIONS.map((name) => (
        <SidebarLink key={name} icon="folder">
          {name}
        </SidebarLink>
      ))}
      <SidebarLink icon="group">{t`Tenant collections`}</SidebarLink>
      {isAdmin && (
        <SidebarLink icon="group">{t`Tenant users' personal collections`}</SidebarLink>
      )}
    </>
  );
}

/**
 * PROTOTYPE: the nav's "External collections" section. Uses the real tenants
 * plugin when the instance has tenants on, and a mocked list otherwise.
 */
export function ExternalCollectionsNavSection(props: Props) {
  const { isReal } = useTenantsEnabled();

  if (isReal) {
    return <PLUGIN_TENANTS.MainNavSharedCollections {...props} />;
  }

  return (
    <SidebarSection>
      <SidebarHeading mb="sm">{t`External collections`}</SidebarHeading>
      <MockExternalCollectionsList />
    </SidebarSection>
  );
}
