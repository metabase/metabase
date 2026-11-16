import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { useListTenantsQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type {
  GroupListQuery,
  IconName,
  Tenant,
  User,
} from "metabase-types/api";

import {
  type PrincipalListItem,
  type PrincipalType,
  useListPreviewPrincipalsQuery,
} from "./api";

/** One row of a who-picker: icon, name, email under it, and a dimmed detail on the right. */
export type PrincipalRow = {
  id: number;
  name: string;
  email?: string;
  /** A user's tenant, or a group's or tenant's size. */
  detail?: string;
  icon: IconName;
};

export type PrincipalSection = {
  /** Only set when the list mixes internal and tenant entries. */
  title?: string;
  rows: PrincipalRow[];
};

/**
 * The users, groups or tenants an admin can preview, in the sections both who-pickers show.
 * Admins and the Administrators group are left out: an admin already sees everything.
 */
export function usePrincipalSections(type: PrincipalType) {
  const hasTenants = Boolean(hasPremiumFeature("tenants"));
  const users = useListUsersQuery({ tenancy: "all" });
  const groups = useListPermissionsGroupsQuery(undefined);
  const tenants = useListTenantsQuery(
    { status: "active" },
    { skip: !hasTenants },
  );

  const isLoading =
    users.isLoading || groups.isLoading || Boolean(tenants.isLoading);
  const error = users.error ?? groups.error ?? tenants.error;
  const sections = getSections({
    type,
    hasTenants,
    users: users.data?.data ?? [],
    groups: groups.data ?? [],
    tenants: tenants.data?.data ?? [],
  });

  return { sections, isLoading, error };
}

/**
 * The same sections from `GET /preview/principals`, for the "View app as…" tab: its other calls run as the previewed
 * person, who may not list users or groups, and this one runs as the admin.
 */
export function usePreviewPrincipalSections(type: PrincipalType) {
  const hasTenants = Boolean(hasPremiumFeature("tenants"));
  const { data, isLoading, error } = useListPreviewPrincipalsQuery();
  const items = data?.[`${type}s`] ?? [];
  const toRow = (item: PrincipalListItem): PrincipalRow => ({
    id: item.id,
    name: item.name,
    detail: item.detail || undefined,
    icon: PRINCIPAL_ICONS[type],
  });
  const [tenantSide, internal] = _.partition(items, (item) => item.tenant_side);
  const sections =
    type === "tenant"
      ? [{ rows: items.map(toRow) }]
      : toSections(hasTenants, [
          {
            title: type === "user" ? t`Internal users` : t`Internal groups`,
            rows: internal.map(toRow),
          },
          {
            title: type === "user" ? t`Tenant users` : t`Tenant groups`,
            rows: tenantSide.map(toRow),
          },
        ]);
  return { sections, isLoading, error };
}

const PRINCIPAL_ICONS: Record<PrincipalType, IconName> = {
  user: "person",
  group: "group",
  tenant: "globe",
};

/** Matches the name, the email and the detail, so a tenant's name finds its users. */
export function matchesPrincipalSearch(row: PrincipalRow, query: string) {
  const text = [row.name, row.email, row.detail].join(" ").toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

type SectionSources = {
  type: PrincipalType;
  hasTenants: boolean;
  users: User[];
  groups: GroupListQuery[];
  tenants: Tenant[];
};

function getSections({
  type,
  hasTenants,
  users,
  groups,
  tenants,
}: SectionSources): PrincipalSection[] {
  switch (type) {
    case "user": {
      const tenantNames = new Map(
        tenants.map((tenant) => [tenant.id, tenant.name]),
      );
      const rows = users
        .filter((user) => !user.is_superuser)
        .map((user) => ({
          tenantId: user.tenant_id,
          row: {
            id: user.id,
            name: user.common_name,
            email: user.email,
            detail:
              user.tenant_id != null
                ? tenantNames.get(user.tenant_id)
                : undefined,
            icon: "person" as const,
          },
        }));
      const [tenantUsers, internalUsers] = _.partition(
        rows,
        ({ tenantId }) => tenantId != null,
      );
      return toSections(hasTenants, [
        { title: t`Internal users`, rows: sortByName(internalUsers) },
        {
          title: t`Tenant users`,
          rows: _.sortBy(sortByName(tenantUsers), (row) => row.detail ?? ""),
        },
      ]);
    }
    case "group": {
      const rows = groups
        .filter((group) => group.magic_group_type !== "admin")
        .map((group) => ({
          isTenantGroup: Boolean(group.is_tenant_group),
          row: {
            id: group.id,
            name: group.name,
            detail: getMemberCount(group.member_count ?? 0),
            icon: getGroupIcon(group),
          },
        }));
      const [tenantGroups, internalGroups] = _.partition(
        rows,
        ({ isTenantGroup }) => isTenantGroup,
      );
      return toSections(hasTenants, [
        { title: t`Internal groups`, rows: builtInFirst(internalGroups) },
        { title: t`Tenant groups`, rows: builtInFirst(tenantGroups) },
      ]);
    }
    case "tenant":
      return [
        {
          rows: _.sortBy(tenants, (tenant) => tenant.name.toLowerCase()).map(
            (tenant) => ({
              id: tenant.id,
              name: tenant.name,
              detail: getUserCount(tenant.member_count),
              icon: "globe",
            }),
          ),
        },
      ];
  }
}

function sortByName(entries: { row: PrincipalRow }[]) {
  return _.sortBy(
    entries.map(({ row }) => row),
    (row) => row.name.toLowerCase(),
  );
}

/** Built-in groups lead, as in the Permissions group sidebar. */
function builtInFirst(entries: { row: PrincipalRow }[]) {
  return _.sortBy(sortByName(entries), (row) => (row.icon === "bolt" ? 0 : 1));
}

/** Without tenants there's one kind of entry, so no headings. */
function toSections(hasTenants: boolean, sections: PrincipalSection[]) {
  const nonEmpty = sections.filter((section) => section.rows.length > 0);
  return hasTenants
    ? nonEmpty
    : nonEmpty.map((section) => ({ rows: section.rows }));
}

/** The icons the Permissions group sidebar uses (`group-sidebar.ts`). */
function getGroupIcon(group: GroupListQuery): IconName {
  const isPinned =
    group.magic_group_type != null && group.magic_group_type !== "data-analyst";
  if (isPinned) {
    return "bolt";
  }
  return group.is_tenant_group ? "globe" : "group";
}

function getMemberCount(count: number) {
  return ngettext(msgid`${count} member`, `${count} members`, count);
}

function getUserCount(count: number) {
  return ngettext(msgid`${count} user`, `${count} users`, count);
}
