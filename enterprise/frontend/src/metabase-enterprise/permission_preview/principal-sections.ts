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
  type PreviewPrincipalsResponse,
  type PrincipalType,
  useListPreviewPrincipalsQuery,
} from "./api";

/** One row of a who-picker, the same in every list: icon, name, a line under the name, and a dimmed detail on the right. */
export type PrincipalRow = {
  id: number;
  name: string;
  /** A user's email, after their tenant's name for a tenant user ("Acme · tina@acme.example"). */
  secondary?: string;
  /** A group's size. */
  detail?: string;
  icon: IconName;
};

export type PrincipalSection = {
  /** Only set when the list mixes internal and tenant entries. */
  title?: string;
  rows: PrincipalRow[];
};

/**
 * The users or groups an admin can preview, in the sections both who-pickers show.
 * Admins and the Administrators group are left out: an admin already sees everything. So is All tenant users, since
 * tenants are previewed through their users.
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
  const sections = getPreviewSections(type, hasTenants, data);
  return { sections, isLoading, error };
}

function getPreviewSections(
  type: PrincipalType,
  hasTenants: boolean,
  data: PreviewPrincipalsResponse | undefined,
): PrincipalSection[] {
  switch (type) {
    case "user":
      return getUserSections(
        hasTenants,
        (data?.users ?? []).map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email ?? undefined,
          tenantName: user.detail ?? undefined,
        })),
      );
    case "group":
      return getGroupSections(
        hasTenants,
        (data?.groups ?? []).map((group) => ({
          isTenantGroup: group.tenant_side,
          isBuiltIn: group.built_in,
          row: {
            id: group.id,
            name: group.name,
            detail: getMemberCount(group.member_count ?? 0),
            icon: getGroupIcon(group.built_in, group.tenant_side),
          },
        })),
      );
  }
}

/** Matches the name, the line under it and the detail, so a tenant's name finds its users. */
export function matchesPrincipalSearch(row: PrincipalRow, query: string) {
  const text = [row.name, row.secondary, row.detail].join(" ").toLowerCase();
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
      return getUserSections(
        hasTenants,
        users
          .filter((user) => !user.is_superuser)
          .map((user) => ({
            id: user.id,
            name: user.common_name,
            email: user.email,
            tenantName:
              user.tenant_id != null
                ? tenantNames.get(user.tenant_id)
                : undefined,
          })),
      );
    }
    case "group":
      return getGroupSections(
        hasTenants,
        groups
          .filter(
            (group) =>
              group.magic_group_type !== "admin" &&
              group.magic_group_type !== "all-external-users",
          )
          .map((group) => {
            // the Permissions group sidebar gives these the bolt (`group-sidebar.ts`)
            const isBuiltIn = group.magic_group_type != null;
            const isTenantGroup = Boolean(group.is_tenant_group);
            return {
              isTenantGroup,
              isBuiltIn,
              row: {
                id: group.id,
                name: group.name,
                detail: getMemberCount(group.member_count ?? 0),
                icon: getGroupIcon(isBuiltIn, isTenantGroup),
              },
            };
          }),
      );
  }
}

type UserEntry = {
  id: number;
  name: string;
  email?: string;
  tenantName?: string;
};

/** Internal users by name, then tenant users by tenant and name, each with the tenant first on the line under the name. */
function getUserSections(
  hasTenants: boolean,
  users: UserEntry[],
): PrincipalSection[] {
  const [tenantUsers, internalUsers] = _.partition(
    _.sortBy(users, (user) => user.name.toLowerCase()),
    (user) => user.tenantName != null,
  );
  const toRow = (user: UserEntry): PrincipalRow => ({
    id: user.id,
    name: user.name,
    secondary:
      [user.tenantName, user.email].filter(Boolean).join(" · ") || undefined,
    icon: "person",
  });
  return toSections(hasTenants, [
    { title: t`Internal users`, rows: internalUsers.map(toRow) },
    {
      title: t`Tenant users`,
      rows: _.sortBy(tenantUsers, (user) => user.tenantName ?? "").map(toRow),
    },
  ]);
}

type GroupEntry = {
  isTenantGroup: boolean;
  isBuiltIn: boolean;
  row: PrincipalRow;
};

/**
 * Internal groups, built-in ones first, then tenant groups by name, as in the Permissions group sidebar
 * (`getOrderedGroups` in `groups.ts` pins only internal groups).
 */
function getGroupSections(
  hasTenants: boolean,
  groups: GroupEntry[],
): PrincipalSection[] {
  const [tenantGroups, internalGroups] = _.partition(
    _.sortBy(groups, (group) => group.row.name.toLowerCase()),
    (group) => group.isTenantGroup,
  );
  const sortedInternalGroups = _.sortBy(internalGroups, (group) =>
    group.isBuiltIn ? 0 : 1,
  );
  return toSections(hasTenants, [
    {
      title: t`Internal groups`,
      rows: sortedInternalGroups.map(({ row }) => row),
    },
    { title: t`Tenant groups`, rows: tenantGroups.map(({ row }) => row) },
  ]);
}

/** Without tenants there's one kind of entry, so no headings. */
function toSections(hasTenants: boolean, sections: PrincipalSection[]) {
  const nonEmpty = sections.filter((section) => section.rows.length > 0);
  return hasTenants
    ? nonEmpty
    : nonEmpty.map((section) => ({ rows: section.rows }));
}

/** The icons the Permissions group sidebar uses (`group-sidebar.ts`). */
function getGroupIcon(isBuiltIn: boolean, isTenantGroup: boolean): IconName {
  if (isBuiltIn) {
    return "bolt";
  }
  return isTenantGroup ? "globe" : "group";
}

function getMemberCount(count: number) {
  return ngettext(msgid`${count} member`, `${count} members`, count);
}
