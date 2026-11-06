import { t } from "ttag";

export const TABLE_ROLES = [
  "role/Fact",
  "role/TransactionFact",
  "role/EventFact",
  "role/PeriodicSnapshotFact",
  "role/AccumulatingSnapshotFact",
  "role/FactlessFact",
  "role/AggregateFact",
  "role/SessionFact",
  "role/UserDayFact",
  "role/CohortSnapshot",
  "role/ActivityStream",
  "role/Dimension",
  "role/EntityDimension",
  "role/DateDimension",
  "role/TimeDimension",
  "role/LookupDimension",
  "role/HistoryDimension",
  "role/MiniDimension",
  "role/JunkDimension",
  "role/OutriggerDimension",
  "role/Bridge",
  "role/HierarchyBridge",
  "role/ArrayChild",
  "role/CustomPropertyTable",
  "role/TranslationTable",
  "role/ConfigurationTable",
  "role/SystemTable",
  "role/OneBigTable",
  "role/Hub",
  "role/Link",
  "role/Satellite",
  "role/PointInTime",
  "role/Anchor",
  "role/Attribute",
  "role/Tie",
  "role/Knot",
] as const;

/** How a table is built: whether its rows can be counted, summed or joined through */
export type TableRole = (typeof TABLE_ROLES)[number];

type RoleGroup =
  | "facts"
  | "dimensions"
  | "bridges"
  | "other"
  | "data-vault"
  | "anchor-modeling";

type RoleDefinition = {
  parent: TableRole | null;
  group: RoleGroup;
  label: () => string;
  /** Completes "One row is …" */
  oneRowIs: () => string;
};

const ROLE_DEFINITIONS: Record<TableRole, RoleDefinition> = {
  "role/Fact": {
    parent: null,
    group: "facts",
    label: () => t`Fact`,
    oneRowIs: () => t`a measurement`,
  },
  "role/TransactionFact": {
    parent: "role/Fact",
    group: "facts",
    label: () => t`Transaction fact`,
    oneRowIs: () => t`one transaction or line`,
  },
  "role/EventFact": {
    parent: "role/Fact",
    group: "facts",
    label: () => t`Event fact`,
    oneRowIs: () => t`one event in a stream`,
  },
  "role/PeriodicSnapshotFact": {
    parent: "role/Fact",
    group: "facts",
    label: () => t`Periodic snapshot`,
    oneRowIs: () => t`one entity per period`,
  },
  "role/AccumulatingSnapshotFact": {
    parent: "role/Fact",
    group: "facts",
    label: () => t`Accumulating snapshot`,
    oneRowIs: () => t`one process instance with milestone dates`,
  },
  "role/FactlessFact": {
    parent: "role/Fact",
    group: "facts",
    label: () => t`Factless fact`,
    oneRowIs: () => t`an occurrence or eligibility`,
  },
  "role/AggregateFact": {
    parent: "role/Fact",
    group: "facts",
    label: () => t`Aggregate`,
    oneRowIs: () => t`a pre-summed group`,
  },
  "role/SessionFact": {
    parent: "role/AggregateFact",
    group: "facts",
    label: () => t`Sessions`,
    oneRowIs: () => t`one session`,
  },
  "role/UserDayFact": {
    parent: "role/PeriodicSnapshotFact",
    group: "facts",
    label: () => t`User-days`,
    oneRowIs: () => t`one user-day`,
  },
  "role/CohortSnapshot": {
    parent: "role/PeriodicSnapshotFact",
    group: "facts",
    label: () => t`Cohort snapshot`,
    oneRowIs: () => t`one cohort-period`,
  },
  "role/ActivityStream": {
    parent: "role/EventFact",
    group: "facts",
    label: () => t`Activity stream`,
    oneRowIs: () => t`one entity's activity at a time`,
  },
  "role/Dimension": {
    parent: null,
    group: "dimensions",
    label: () => t`Dimension`,
    oneRowIs: () => t`one thing with attributes`,
  },
  "role/EntityDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`Entity`,
    oneRowIs: () => t`a business entity`,
  },
  "role/DateDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`Date dimension`,
    oneRowIs: () => t`a calendar day`,
  },
  "role/TimeDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`Time dimension`,
    oneRowIs: () => t`a time of day`,
  },
  "role/LookupDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`Lookup`,
    oneRowIs: () => t`one code with a label`,
  },
  "role/HistoryDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`History`,
    oneRowIs: () => t`one version of an entity`,
  },
  "role/MiniDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`Mini-dimension`,
    oneRowIs: () => t`a band of fast-changing attributes`,
  },
  "role/JunkDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`Junk dimension`,
    oneRowIs: () => t`a bundle of flags`,
  },
  "role/OutriggerDimension": {
    parent: "role/Dimension",
    group: "dimensions",
    label: () => t`Outrigger`,
    oneRowIs: () => t`a dimension of a dimension`,
  },
  "role/Bridge": {
    parent: null,
    group: "bridges",
    label: () => t`Bridge`,
    oneRowIs: () => t`one link between two things`,
  },
  "role/HierarchyBridge": {
    parent: "role/Bridge",
    group: "bridges",
    label: () => t`Hierarchy bridge`,
    oneRowIs: () => t`one ancestor–descendant pair`,
  },
  "role/ArrayChild": {
    parent: "role/Bridge",
    group: "bridges",
    label: () => t`List items`,
    oneRowIs: () => t`one element of a parent's list`,
  },
  "role/CustomPropertyTable": {
    parent: null,
    group: "other",
    label: () => t`Custom properties`,
    oneRowIs: () => t`one entity, property, and value`,
  },
  "role/TranslationTable": {
    parent: null,
    group: "other",
    label: () => t`Translations`,
    oneRowIs: () => t`one entity in one locale`,
  },
  "role/ConfigurationTable": {
    parent: null,
    group: "other",
    label: () => t`Configuration`,
    oneRowIs: () => t`one setting or definition`,
  },
  "role/SystemTable": {
    parent: null,
    group: "other",
    label: () => t`System`,
    oneRowIs: () => t`loader or tool bookkeeping`,
  },
  "role/OneBigTable": {
    parent: null,
    group: "other",
    label: () => t`One big table`,
    oneRowIs: () => t`a fact joined with its dimensions`,
  },
  "role/Hub": {
    parent: null,
    group: "data-vault",
    label: () => t`Hub`,
    oneRowIs: () => t`a business key`,
  },
  "role/Link": {
    parent: null,
    group: "data-vault",
    label: () => t`Link`,
    oneRowIs: () => t`a relationship`,
  },
  "role/Satellite": {
    parent: null,
    group: "data-vault",
    label: () => t`Satellite`,
    oneRowIs: () => t`a key's attributes over time`,
  },
  "role/PointInTime": {
    parent: null,
    group: "data-vault",
    label: () => t`Point-in-time`,
    oneRowIs: () => t`a point-in-time helper row`,
  },
  "role/Anchor": {
    parent: null,
    group: "anchor-modeling",
    label: () => t`Anchor`,
    oneRowIs: () => t`an anchor`,
  },
  "role/Attribute": {
    parent: null,
    group: "anchor-modeling",
    label: () => t`Attribute`,
    oneRowIs: () => t`one attribute value over time`,
  },
  "role/Tie": {
    parent: null,
    group: "anchor-modeling",
    label: () => t`Tie`,
    oneRowIs: () => t`a tie between anchors`,
  },
  "role/Knot": {
    parent: null,
    group: "anchor-modeling",
    label: () => t`Knot`,
    oneRowIs: () => t`a shared value`,
  },
};

function getRoleGroupLabel(group: RoleGroup): string {
  switch (group) {
    case "facts":
      return t`Facts`;
    case "dimensions":
      return t`Dimensions`;
    case "bridges":
      return t`Bridges`;
    case "other":
      return t`Other`;
    case "data-vault":
      return t`Data Vault`;
    case "anchor-modeling":
      return t`Anchor modeling`;
  }
}

export function isTableRole(value: unknown): value is TableRole {
  return TABLE_ROLES.some((role) => role === value);
}

export function getTableRoleLabel(role: TableRole): string {
  return ROLE_DEFINITIONS[role].label();
}

export function getTableRoleRowDescription(role: TableRole): string {
  return ROLE_DEFINITIONS[role].oneRowIs();
}

/** Whether `role` is `ancestor` or derives from it, like `derive` in the backend's type hierarchy. */
export function isRoleA(role: TableRole, ancestor: TableRole): boolean {
  let current: TableRole | null = role;
  while (current != null) {
    if (current === ancestor) {
      return true;
    }
    current = ROLE_DEFINITIONS[current].parent;
  }
  return false;
}

/** Roles grouped for a Select, in catalog order */
export function getTableRoleOptions(): {
  group: string;
  items: { value: TableRole; label: string }[];
}[] {
  const groups = new Map<RoleGroup, { value: TableRole; label: string }[]>();
  TABLE_ROLES.forEach((role) => {
    const { group, label } = ROLE_DEFINITIONS[role];
    groups.set(group, [
      ...(groups.get(group) ?? []),
      { value: role, label: label() },
    ]);
  });
  return Array.from(groups, ([group, items]) => ({
    group: getRoleGroupLabel(group),
    items,
  }));
}
