import { t } from "ttag";

import type {
  Database,
  GroupId,
  GroupTableAccessPolicy,
  Impersonation,
} from "metabase-types/api";

import { formatList } from "./format-list";

export type AttributeUse =
  | { kind: "sandbox"; names: string[] }
  | { kind: "impersonation"; names: string[] }
  | { kind: "routing"; names: string[] };

export interface GroupAttribute {
  name: string;
  uses: AttributeUse[];
}

interface GroupAttributeSources {
  groupId: GroupId;
  policies: GroupTableAccessPolicy[];
  impersonations: Impersonation[];
  databases: Database[];
}

/**
 * The user attributes the rules of a group read, in the order the rules are
 * read: row and column security, connection impersonation, database routing.
 * Attributes that start with `@` are Metabase's own and are left out.
 */
export function getGroupAttributes({
  groupId,
  policies,
  impersonations,
  databases,
}: GroupAttributeSources): GroupAttribute[] {
  const attributes = new Map<string, AttributeUse[]>();

  function addUse(name: string, use: AttributeUse) {
    if (!name.startsWith("@")) {
      attributes.set(name, [...(attributes.get(name) ?? []), use]);
    }
  }

  const tableNames = new Map(
    databases.flatMap((database) =>
      (database.tables ?? []).map((table) => [table.id, table.display_name]),
    ),
  );
  const databaseNames = new Map(
    databases.map((database) => [database.id, database.name]),
  );

  for (const policy of policies) {
    const tableName = tableNames.get(policy.table_id);
    for (const name of Object.keys(policy.attribute_remappings)) {
      addUse(name, { kind: "sandbox", names: tableName ? [tableName] : [] });
    }
  }

  for (const impersonation of impersonations) {
    const databaseName = databaseNames.get(impersonation.db_id);
    if (impersonation.group_id === groupId) {
      addUse(impersonation.attribute, {
        kind: "impersonation",
        names: databaseName ? [databaseName] : [],
      });
    }
  }

  for (const database of databases) {
    if (database.router_user_attribute) {
      addUse(database.router_user_attribute, {
        kind: "routing",
        names: [database.name],
      });
    }
  }

  return [...attributes].map(([name, uses]) => ({
    name,
    uses: mergeUses(uses),
  }));
}

function mergeUses(uses: AttributeUse[]) {
  return uses.reduce<AttributeUse[]>((merged, use) => {
    const same = merged.find((other) => other.kind === use.kind);
    if (same) {
      same.names = [...same.names, ...use.names];
    } else {
      merged.push({ ...use, names: [...use.names] });
    }
    return merged;
  }, []);
}

export function getUseDescription({ kind, names }: AttributeUse) {
  const list = formatList(names);

  switch (kind) {
    case "sandbox":
      return t`Used by row and column security on ${list}`;
    case "impersonation":
      return t`Used by connection impersonation on ${list}`;
    case "routing":
      return t`Used by database routing on ${list}`;
  }
}
