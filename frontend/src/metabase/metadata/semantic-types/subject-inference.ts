import { t } from "ttag";

import {
  type TableRole,
  getTableRoleLabel,
  isRoleA,
} from "metabase/metadata/table-structure";

import {
  NO_SUBJECT,
  type TableSubject,
  getTableSubjectLabel,
  isTableSubject,
} from "./subjects";

export type InferenceConfidence = "high" | "low";

export type SubjectInference = {
  subject: TableSubject | null;
  signal: string;
  confidence: InferenceConfidence;
};

type SubjectWord = {
  subject: TableSubject;
  isAmbiguous?: boolean;
};

const SUBJECT_WORDS: Record<string, SubjectWord> = {
  user: { subject: "entity/UserTable" },
  member: { subject: "entity/UserTable" },
  login: { subject: "entity/UserTable" },
  person: { subject: "entity/PersonTable" },
  contact: { subject: "entity/ContactTable" },
  lead: { subject: "entity/ContactTable" },
  prospect: { subject: "entity/ContactTable" },
  subscriber: { subject: "entity/ContactTable" },
  recipient: { subject: "entity/ContactTable" },
  employee: { subject: "entity/EmployeeTable" },
  worker: { subject: "entity/EmployeeTable" },
  staff: { subject: "entity/EmployeeTable" },
  customer: { subject: "entity/CustomerTable" },
  client: { subject: "entity/CustomerTable" },
  shopper: { subject: "entity/CustomerTable" },
  organization: { subject: "entity/OrganizationTable" },
  org: { subject: "entity/OrganizationTable" },
  workspace: { subject: "entity/OrganizationTable" },
  tenant: { subject: "entity/OrganizationTable" },
  account: { subject: "entity/OrganizationTable", isAmbiguous: true },
  team: { subject: "entity/OrganizationTable", isAmbiguous: true },
  group: { subject: "entity/OrganizationTable", isAmbiguous: true },
  company: { subject: "entity/CompanyTable" },
  vendor: { subject: "entity/CompanyTable" },
  supplier: { subject: "entity/CompanyTable" },
  merchant: { subject: "entity/CompanyTable" },
  partner: { subject: "entity/CompanyTable" },
  product: { subject: "entity/ProductTable" },
  sku: { subject: "entity/ProductTable" },
  variant: { subject: "entity/ProductTable" },
  plan: { subject: "entity/ProductTable", isAmbiguous: true },
  item: { subject: "entity/ProductTable", isAmbiguous: true },
  order: { subject: "entity/TransactionTable" },
  invoice: { subject: "entity/TransactionTable" },
  payment: { subject: "entity/TransactionTable" },
  charge: { subject: "entity/TransactionTable" },
  transaction: { subject: "entity/TransactionTable" },
  sale: { subject: "entity/TransactionTable" },
  refund: { subject: "entity/TransactionTable" },
  purchase: { subject: "entity/TransactionTable" },
  payout: { subject: "entity/TransactionTable" },
  subscription: { subject: "entity/SubscriptionTable" },
  contract: { subject: "entity/SubscriptionTable" },
  license: { subject: "entity/SubscriptionTable" },
  membership: { subject: "entity/SubscriptionTable" },
  event: { subject: "entity/EventTable" },
  log: { subject: "entity/EventTable" },
  activity: { subject: "entity/EventTable" },
  pageview: { subject: "entity/EventTable" },
  click: { subject: "entity/EventTable" },
  track: { subject: "entity/EventTable" },
  message: { subject: "entity/MessageTable" },
  email: { subject: "entity/MessageTable" },
  sms: { subject: "entity/MessageTable" },
  chat: { subject: "entity/MessageTable" },
  notification: { subject: "entity/MessageTable" },
  call: { subject: "entity/MessageTable" },
  conversation: { subject: "entity/MessageTable" },
  comment: { subject: "entity/MessageTable", isAmbiguous: true },
  session: { subject: "entity/SessionTable" },
  visit: { subject: "entity/SessionTable" },
  campaign: { subject: "entity/CampaignTable" },
  ad: { subject: "entity/CampaignTable" },
  adgroup: { subject: "entity/CampaignTable" },
  creative: { subject: "entity/CampaignTable" },
  deal: { subject: "entity/OpportunityTable" },
  opportunity: { subject: "entity/OpportunityTable" },
  pipeline: { subject: "entity/OpportunityTable" },
  ticket: { subject: "entity/TicketTable" },
  case: { subject: "entity/TicketTable" },
  incident: { subject: "entity/TicketTable" },
  issue: { subject: "entity/TicketTable" },
  task: { subject: "entity/TicketTable", isAmbiguous: true },
  project: { subject: "entity/ProjectTable" },
  job: { subject: "entity/ProjectTable", isAmbiguous: true },
  location: { subject: "entity/LocationTable" },
  site: { subject: "entity/LocationTable" },
  store: { subject: "entity/LocationTable" },
  address: { subject: "entity/LocationTable" },
  warehouse: { subject: "entity/LocationTable" },
  region: { subject: "entity/LocationTable" },
  device: { subject: "entity/DeviceTable" },
  asset: { subject: "entity/DeviceTable" },
  calendar: { subject: "entity/CalendarTable" },
  date: { subject: "entity/CalendarTable", isAmbiguous: true },
  day: { subject: "entity/CalendarTable", isAmbiguous: true },
  fiscal: { subject: "entity/CalendarTable" },
};

const COMPOUND_SUBJECTS: { pattern: RegExp; subject: TableSubject }[] = [
  {
    pattern: /(^|_)((order|invoice|cart|line)_)?(line_items?|lines|items)$/,
    subject: "entity/LineItemTable",
  },
  { pattern: /(^|_)(ad_groups?|ad_sets?)$/, subject: "entity/CampaignTable" },
  { pattern: /(^|_)page_views?$/, subject: "entity/EventTable" },
];

const NO_SUBJECT_ROLES: TableRole[] = [
  "role/SystemTable",
  "role/TranslationTable",
  "role/ConfigurationTable",
  "role/LookupDimension",
];

const PREFIX_RE = /^(dim|fct|fact|stg|raw|src|int|d|f)_/;
const SUFFIX_RE =
  /_(history|histories|snapshots?|versions?|scd|daily|weekly|monthly|v\d+)$/;
const EXTRACT_VIEW_RE = /(^|_)pvo(_|$)/;

const IRREGULAR_SINGULARS: Record<string, string> = {
  people: "person",
  staff: "staff",
  data: "data",
  news: "news",
  status: "status",
  address: "address",
  analysis: "analysis",
};

export function singularize(word: string): string {
  const irregular = IRREGULAR_SINGULARS[word];
  if (irregular != null) {
    return irregular;
  }
  if (/ies$/.test(word)) {
    return word.replace(/ies$/, "y");
  }
  if (/(ches|shes|sses|xes)$/.test(word)) {
    return word.replace(/es$/, "");
  }
  if (/[^s]s$/.test(word)) {
    return word.replace(/s$/, "");
  }
  return word;
}

export function pluralize(word: string): string {
  const irregular = Object.entries(IRREGULAR_SINGULARS).find(
    ([plural, singular]) => singular === word && plural !== singular,
  );
  if (irregular != null) {
    return irregular[0];
  }
  if (/[^aeiou]y$/.test(word)) {
    return word.replace(/y$/, "ies");
  }
  if (/(ch|sh|ss|x)$/.test(word)) {
    return `${word}es`;
  }
  if (/s$/.test(word)) {
    return word;
  }
  return `${word}s`;
}

export function getTableNameWords(name: string): string[] {
  const coreName = name
    .toLowerCase()
    .replace(PREFIX_RE, "")
    .replace(SUFFIX_RE, "");
  return coreName.split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

export type RowNouns = { singular: string; plural: string };

export function getRowNouns(displayName: string): RowNouns {
  const words = displayName.trim().toLowerCase().split(/\s+/);
  const head = words.at(-1) ?? "";
  const rest = words.slice(0, -1);
  const singularHead = singularize(head);
  return {
    singular: [...rest, singularHead].join(" "),
    plural: [...rest, pluralize(singularHead)].join(" "),
  };
}

type SubjectTable = { name: string; entity_type?: string | null };

export function inferTableSubject(
  table: SubjectTable,
  role: TableRole | null,
): SubjectInference {
  return (
    inferFromRole(table, role) ??
    inferFromName(table.name) ??
    inferFromSync(table.entity_type) ?? {
      subject: null,
      signal: t`No name or role signal matched`,
      confidence: "low",
    }
  );
}

function inferFromRole(
  { name }: SubjectTable,
  role: TableRole | null,
): SubjectInference | null {
  const lowerName = name.toLowerCase();
  if (EXTRACT_VIEW_RE.test(lowerName)) {
    return {
      subject: null,
      signal: t`Extract views don't get a subject`,
      confidence: "high",
    };
  }
  if (role == null) {
    return null;
  }
  const isPlainBridge =
    isRoleA(role, "role/Bridge") && !isRoleA(role, "role/ArrayChild");
  const skippedRole = NO_SUBJECT_ROLES.find((skipped) =>
    isRoleA(role, skipped),
  );
  if (isPlainBridge || skippedRole != null) {
    const roleLabel = getTableRoleLabel(role).toLowerCase();
    return {
      subject: null,
      signal: t`A ${roleLabel} table doesn't get a subject`,
      confidence: "high",
    };
  }
  const isChildOfTransactions =
    isRoleA(role, "role/ArrayChild") || isRoleA(role, "role/TransactionFact");
  if (isChildOfTransactions && /(^|_)(lines?|items?)(_|$)/.test(lowerName)) {
    return {
      subject: "entity/LineItemTable",
      signal: t`Lines under a transaction, from its role and name`,
      confidence: "high",
    };
  }
  if (isRoleA(role, "role/DateDimension")) {
    return {
      subject: "entity/CalendarTable",
      signal: t`Its role is a date dimension`,
      confidence: "high",
    };
  }
  if (isRoleA(role, "role/SessionFact")) {
    return {
      subject: "entity/SessionTable",
      signal: t`Its role is sessions`,
      confidence: "high",
    };
  }
  return null;
}

function inferFromName(name: string): SubjectInference | null {
  const words = getTableNameWords(name);
  const coreName = words.join("_");
  const compound = COMPOUND_SUBJECTS.find(({ pattern }) =>
    pattern.test(coreName),
  );
  if (compound) {
    return {
      subject: compound.subject,
      signal: t`Name matches "${coreName}"`,
      confidence: "high",
    };
  }

  const singularWords = words.map(singularize);
  const head = singularWords.at(-1);
  const headMatch = head != null ? SUBJECT_WORDS[head] : undefined;
  if (head != null && headMatch != null) {
    return {
      subject: headMatch.subject,
      signal: headMatch.isAmbiguous
        ? t`Name matches "${head}", which can mean more than one thing`
        : t`Name matches "${head}"`,
      confidence: headMatch.isAmbiguous ? "low" : "high",
    };
  }

  const otherWord = singularWords
    .slice(0, -1)
    .reverse()
    .find((word) => SUBJECT_WORDS[word] != null);
  const otherMatch = otherWord != null ? SUBJECT_WORDS[otherWord] : undefined;
  if (otherWord != null && otherMatch != null) {
    return {
      subject: otherMatch.subject,
      signal: t`Name contains "${otherWord}"`,
      confidence: "low",
    };
  }
  return null;
}

function inferFromSync(
  entityType: string | null | undefined,
): SubjectInference | null {
  if (!isTableSubject(entityType) || entityType === NO_SUBJECT) {
    return null;
  }
  return {
    subject: entityType,
    signal: t`Sync set ${getTableSubjectLabel(entityType)}`,
    confidence: "high",
  };
}
