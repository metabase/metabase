import { t } from "ttag";

import type { IconName } from "metabase-types/api";

export const TABLE_SUBJECTS = [
  "entity/GenericTable",
  "entity/PersonTable",
  "entity/UserTable",
  "entity/ContactTable",
  "entity/EmployeeTable",
  "entity/CustomerTable",
  "entity/OrganizationTable",
  "entity/CompanyTable",
  "entity/ProductTable",
  "entity/TransactionTable",
  "entity/LineItemTable",
  "entity/SubscriptionTable",
  "entity/EventTable",
  "entity/MessageTable",
  "entity/SessionTable",
  "entity/CampaignTable",
  "entity/OpportunityTable",
  "entity/TicketTable",
  "entity/ProjectTable",
  "entity/LocationTable",
  "entity/DeviceTable",
  "entity/CalendarTable",
] as const;

export type TableSubject = (typeof TABLE_SUBJECTS)[number];

export const NO_SUBJECT: TableSubject = "entity/GenericTable";

type SubjectGroup =
  | "people"
  | "organizations"
  | "commerce"
  | "activity"
  | "sales"
  | "work"
  | "things";

type SubjectDefinition = {
  parent: TableSubject | null;
  group: SubjectGroup | null;
  label: () => string;
  icon: IconName;
  isNew: boolean;
};

const SUBJECT_DEFINITIONS: Record<TableSubject, SubjectDefinition> = {
  "entity/GenericTable": {
    parent: null,
    group: null,
    label: () => t`No subject`,
    icon: "table2",
    isNew: false,
  },
  "entity/PersonTable": {
    parent: null,
    group: "people",
    label: () => t`People`,
    icon: "person",
    isNew: true,
  },
  "entity/UserTable": {
    parent: "entity/PersonTable",
    group: "people",
    label: () => t`Users`,
    icon: "person",
    isNew: false,
  },
  "entity/ContactTable": {
    parent: "entity/PersonTable",
    group: "people",
    label: () => t`Contacts and leads`,
    icon: "mail_at",
    isNew: true,
  },
  "entity/EmployeeTable": {
    parent: "entity/PersonTable",
    group: "people",
    label: () => t`Employees`,
    icon: "badge",
    isNew: true,
  },
  "entity/CustomerTable": {
    parent: "entity/PersonTable",
    group: "people",
    label: () => t`Customers`,
    icon: "heart_handshake",
    isNew: true,
  },
  "entity/OrganizationTable": {
    parent: null,
    group: "organizations",
    label: () => t`Accounts and workspaces`,
    icon: "group",
    isNew: true,
  },
  "entity/CompanyTable": {
    parent: null,
    group: "organizations",
    label: () => t`Companies`,
    icon: "company",
    isNew: false,
  },
  "entity/ProductTable": {
    parent: null,
    group: "commerce",
    label: () => t`Products`,
    icon: "package",
    isNew: false,
  },
  "entity/TransactionTable": {
    parent: null,
    group: "commerce",
    label: () => t`Orders and payments`,
    icon: "receipt",
    isNew: false,
  },
  "entity/LineItemTable": {
    parent: null,
    group: "commerce",
    label: () => t`Line items`,
    icon: "list",
    isNew: true,
  },
  "entity/SubscriptionTable": {
    parent: null,
    group: "commerce",
    label: () => t`Subscriptions`,
    icon: "sync",
    isNew: false,
  },
  "entity/EventTable": {
    parent: null,
    group: "activity",
    label: () => t`Events`,
    icon: "event",
    isNew: false,
  },
  "entity/MessageTable": {
    parent: null,
    group: "activity",
    label: () => t`Messages`,
    icon: "message_circle",
    isNew: true,
  },
  "entity/SessionTable": {
    parent: null,
    group: "activity",
    label: () => t`Sessions`,
    icon: "hourglass",
    isNew: true,
  },
  "entity/CampaignTable": {
    parent: null,
    group: "sales",
    label: () => t`Campaigns and ads`,
    icon: "send",
    isNew: true,
  },
  "entity/OpportunityTable": {
    parent: null,
    group: "sales",
    label: () => t`Deals and opportunities`,
    icon: "trend_up",
    isNew: true,
  },
  "entity/TicketTable": {
    parent: null,
    group: "work",
    label: () => t`Tickets and issues`,
    icon: "clipboard",
    isNew: true,
  },
  "entity/ProjectTable": {
    parent: null,
    group: "work",
    label: () => t`Projects`,
    icon: "layout_grid",
    isNew: true,
  },
  "entity/LocationTable": {
    parent: null,
    group: "things",
    label: () => t`Locations`,
    icon: "location",
    isNew: true,
  },
  "entity/DeviceTable": {
    parent: null,
    group: "things",
    label: () => t`Devices and assets`,
    icon: "io",
    isNew: true,
  },
  "entity/CalendarTable": {
    parent: null,
    group: "things",
    label: () => t`Calendar`,
    icon: "calendar",
    isNew: true,
  },
};

function getSubjectGroupLabel(group: SubjectGroup): string {
  switch (group) {
    case "people":
      return t`People`;
    case "organizations":
      return t`Organizations`;
    case "commerce":
      return t`Commerce`;
    case "activity":
      return t`Activity`;
    case "sales":
      return t`Sales and marketing`;
    case "work":
      return t`Work`;
    case "things":
      return t`Places and things`;
  }
}

export function isTableSubject(value: unknown): value is TableSubject {
  return TABLE_SUBJECTS.some((subject) => subject === value);
}

export function getTableSubjectLabel(subject: TableSubject): string {
  return SUBJECT_DEFINITIONS[subject].label();
}

export function getTableSubjectIcon(subject: TableSubject | null): IconName {
  return SUBJECT_DEFINITIONS[subject ?? NO_SUBJECT].icon;
}

export function isSubjectA(
  subject: TableSubject | null,
  ancestor: TableSubject,
): boolean {
  let current = subject;
  while (current != null) {
    if (current === ancestor) {
      return true;
    }
    current = SUBJECT_DEFINITIONS[current].parent;
  }
  return false;
}

export type TableSubjectOption = {
  value: TableSubject;
  label: string;
  icon: IconName;
};

export function getTableSubjectOptions(): {
  group: string;
  items: TableSubjectOption[];
}[] {
  const groups = new Map<SubjectGroup, TableSubjectOption[]>();
  TABLE_SUBJECTS.forEach((subject) => {
    const { group, label, icon } = SUBJECT_DEFINITIONS[subject];
    if (group != null) {
      groups.set(group, [
        ...(groups.get(group) ?? []),
        { value: subject, label: label(), icon },
      ]);
    }
  });
  return [
    {
      group: t`None`,
      items: [
        {
          value: NO_SUBJECT,
          label: getTableSubjectLabel(NO_SUBJECT),
          icon: getTableSubjectIcon(NO_SUBJECT),
        },
      ],
    },
    ...Array.from(groups, ([group, items]) => ({
      group: getSubjectGroupLabel(group),
      items,
    })),
  ];
}
