import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { isDate, isFK, isInteger, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ConcreteTableId,
  Field,
  FieldId,
  Table,
} from "metabase-types/api";

import { type TableRole, getTableRoleLabel } from "./roles";

export type RowIdentity =
  | "natural"
  | "surrogate"
  | "hash"
  | "composite"
  | "none";

export type PeriodGranularity =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export const PERIOD_GRANULARITIES: PeriodGranularity[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

/** What sync would propose for a table's role, and the signal behind it */
export type RoleInference = {
  role: TableRole | null;
  signal: string;
  /** Low-confidence guesses (and no guess at all) need an admin's review */
  confidence: "high" | "low";
};

/** How to read a history table: which rows are versions of the same thing */
export type HistoryBinding = {
  durableKeyFieldId: FieldId | null;
  validFromFieldId: FieldId | null;
  validToFieldId: FieldId | null;
  currentFlagFieldId: FieldId | null;
  /** Filter to the current version of each row by default */
  currentRowsOnly: boolean;
};

/** How to read an entity–attribute–value table */
export type EavBinding = {
  entityKeyFieldId: FieldId | null;
  propertyFieldId: FieldId | null;
  valueFieldId: FieldId | null;
  definitionTableId: ConcreteTableId | null;
  labelFieldId: FieldId | null;
  typeFieldId: FieldId | null;
};

export type EavDefinitionInference = {
  definitionTableId: ConcreteTableId | null;
  labelFieldId: FieldId | null;
  typeFieldId: FieldId | null;
  signal: string;
};

export type DefinitionColumns = {
  keyFieldId: FieldId | null;
  labelFieldId: FieldId | null;
  typeFieldId: FieldId | null;
};

export type CustomPropertyFacet = {
  prefix: string;
  suffix: string;
};

export type SchemaTable = Pick<Table, "id" | "name"> & { fields?: Field[] };

type TableShape = { name: string; fields: Field[] };

const INDEX_RE = /(^|_)(index|idx|position|pos|seq|sequence|ordinal)$/;
const VERSION_RE = /(^|_)version$/;
const VALID_FROM_RE =
  /(^|_)(valid_from|effective_from|dbt_valid_from)$|^_fivetran_start$/;
const VALID_TO_RE =
  /(^|_)(valid_to|effective_to|dbt_valid_to)$|^_fivetran_end$/;
const CURRENT_FLAG_RE =
  /^(is_current|current_flag|is_latest)$|^_fivetran_active$/;
const STATUS_RE = /(^|_)(status|state|stage)$/;
const CREATED_RE = /^(created_at|created|created_on|inserted_at)$/;
const UPDATED_RE =
  /^(updated_at|updated|updated_on|modified_at|last_modified)$/;
const LABEL_RE = /^(name|label|code|title|description|display_name)$/;
const HASH_KEY_RE = /^_fivetran_id$|(^|_)(hash|hk|hash_key)$/;
const SURROGATE_KEY_RE = /_(sk|key)$/;
const PROPERTY_RE =
  /(^|_)(property|attribute|key|field|name)(_name|_key|_id)?$/;
const VALUE_RE = /(^|_)value$/;
const DEFINITION_LABEL_RES = [/^title$/, /^label$/, /^display_name$/, /^name$/];
const DEFINITION_TYPE_RE = /^(type|data_type|field_type|value_type)$/;
const DEFINITION_KEY_RES = [/^name$/, /^key$/, /^(api|internal)_name$/];
const WILDCARD_RE = /^(custom|property)_(.+)$/;
const DEFINITION_SIBLING_SUFFIX_RE = /_(values?|history)$/;

// Name rules, in priority order; downstream prefixes are strong signals
const NAME_RULES: {
  pattern: RegExp;
  role: TableRole;
  confidence: RoleInference["confidence"];
}[] = [
  {
    pattern: /^(_fivetran|fivetran_|dbt_)|_audit$/,
    role: "role/SystemTable",
    confidence: "high",
  },
  { pattern: /^(dim_|d_)/, role: "role/EntityDimension", confidence: "high" },
  {
    pattern: /^(fct_|fact_|f_)/,
    role: "role/TransactionFact",
    confidence: "high",
  },
  { pattern: /^agg_/, role: "role/AggregateFact", confidence: "high" },
  { pattern: /^hub_/, role: "role/Hub", confidence: "high" },
  { pattern: /^sat_/, role: "role/Satellite", confidence: "high" },
  { pattern: /^(lnk_|link_)/, role: "role/Link", confidence: "high" },
  {
    pattern: /_(history|snapshots?|versions?)$/,
    role: "role/HistoryDimension",
    confidence: "low",
  },
  {
    pattern: /_(summary|totals|rollup)$/,
    role: "role/AggregateFact",
    confidence: "low",
  },
  {
    pattern: /_(report|daily|weekly|monthly|stats)$/,
    role: "role/PeriodicSnapshotFact",
    confidence: "low",
  },
  {
    pattern: /_(translations?|i18n|locales?)$/,
    role: "role/TranslationTable",
    confidence: "low",
  },
  {
    pattern: /custom_fields?|property_values?|_properties$/,
    role: "role/CustomPropertyTable",
    confidence: "low",
  },
  {
    pattern: /(^|_)(settings|config|configuration|preferences)$/,
    role: "role/ConfigurationTable",
    confidence: "low",
  },
  {
    pattern:
      /(^|_)(events?|logs?|checkins?|clicks?|pageviews?|activit(y|ies))$/,
    role: "role/EventFact",
    confidence: "low",
  },
  {
    pattern:
      /(^|_)(orders?|order_lines?|transactions?|sales?|payments?|invoices?)$/,
    role: "role/TransactionFact",
    confidence: "low",
  },
  {
    pattern:
      /(^|_)(users?|accounts?|people|persons?|customers?|employees?|products?|companies|company|vendors?|deals?|tickets?)$/,
    role: "role/EntityDimension",
    confidence: "low",
  },
  {
    pattern: /(^|_)(types|statuses|categories|codes)$/,
    role: "role/LookupDimension",
    confidence: "low",
  },
];

const nameOf = (field: Field) => field.name.toLowerCase();
const matches = (field: Field, pattern: RegExp) => pattern.test(nameOf(field));

/**
 * Proposes a role from a table's keys, then its columns, then its name, the
 * order of strength in the spec. Value-based signals need row counts and
 * fingerprints over time, which aren't available here.
 */
export function inferTableRole({ name, fields }: TableShape): RoleInference {
  return (
    inferFromKeys(fields) ??
    inferFromColumns(fields) ??
    inferFromName(name) ?? {
      role: null,
      signal: t`No key, column, or name signal matched`,
      confidence: "low",
    }
  );
}

function inferFromKeys(fields: Field[]): RoleInference | null {
  const pks = fields.filter(isPK);
  const fks = fields.filter(isFK);

  if (fks.length >= 2 && fields.every((field) => isPK(field) || isFK(field))) {
    return {
      role: "role/Bridge",
      signal: t`Every column is a key, linking ${fks.length} tables`,
      confidence: "high",
    };
  }

  const indexKey = pks.find((field) => matches(field, INDEX_RE));
  if (indexKey && fks.length === 1) {
    return {
      role: "role/ArrayChild",
      signal: t`Key is ${fks[0].name} plus the position ${indexKey.name}`,
      confidence: "high",
    };
  }

  if (pks.length >= 2) {
    const dateKey = pks.find((field) => isDate(field));
    if (dateKey && pks.every((field) => field === dateKey || isFK(field))) {
      return {
        role: "role/PeriodicSnapshotFact",
        signal: t`Key is the date ${dateKey.name} plus foreign keys`,
        confidence: "high",
      };
    }

    const versionKey =
      dateKey ?? pks.find((field) => matches(field, VERSION_RE));
    if (versionKey) {
      return {
        role: "role/HistoryDimension",
        signal: t`Key is an ID plus ${versionKey.name}`,
        confidence: "high",
      };
    }
  }

  return null;
}

function inferFromColumns(fields: Field[]): RoleInference | null {
  const pks = fields.filter(isPK);
  const fks = fields.filter(isFK);
  const dates = fields.filter((field) => isDate(field));

  const eavRole = inferEavRole(fields);
  if (eavRole) {
    return eavRole;
  }

  const validFrom = fields.find((field) => matches(field, VALID_FROM_RE));
  const validTo = fields.find((field) => matches(field, VALID_TO_RE));
  if (validFrom && validTo) {
    return {
      role: "role/HistoryDimension",
      signal: t`Has ${validFrom.name} and ${validTo.name} columns`,
      confidence: "high",
    };
  }

  const milestones = dates.filter(
    (field) => !matches(field, CREATED_RE) && !matches(field, UPDATED_RE),
  );
  const status = fields.find((field) => matches(field, STATUS_RE));
  if (milestones.length >= 3 && status) {
    return {
      role: "role/AccumulatingSnapshotFact",
      signal: t`Has ${milestones.length} milestone dates and ${status.name}`,
      confidence: "low",
    };
  }

  const nonKeys = fields.filter((field) => !isPK(field));
  if (
    pks.length <= 1 &&
    fields.length <= 5 &&
    nonKeys.length > 0 &&
    nonKeys.every((field) => matches(field, LABEL_RE))
  ) {
    return {
      role: "role/LookupDimension",
      signal: t`Only a key and label columns`,
      confidence: "low",
    };
  }

  const hasUpdatedAt = fields.some((field) => matches(field, UPDATED_RE));
  if (dates.length === 1 && !hasUpdatedAt && fks.length >= 1) {
    return {
      role: "role/EventFact",
      signal: t`One timestamp, no updated_at, and a link to ${fks[0].name}`,
      confidence: "low",
    };
  }

  const hasCreatedAt = fields.some((field) => matches(field, CREATED_RE));
  const hasLabel = fields.some((field) => matches(field, LABEL_RE));
  if (pks.length === 1 && hasLabel && hasCreatedAt && hasUpdatedAt) {
    return {
      role: "role/EntityDimension",
      signal: t`A single key, a name, and created and updated dates`,
      confidence: "low",
    };
  }

  return null;
}

function inferEavRole(fields: Field[]): RoleInference | null {
  const valueField = fields.find((field) => matches(field, VALUE_RE));
  const propertyField = fields.find(
    (field) => !isPK(field) && matches(field, PROPERTY_RE),
  );
  const entityKey = fields.find(
    (field) => isFK(field) && field !== propertyField,
  );
  if (valueField && propertyField && entityKey) {
    return {
      role: "role/CustomPropertyTable",
      signal: t`Has ${entityKey.name}, ${propertyField.name} and ${valueField.name} columns`,
      confidence: "high",
    };
  }

  const { labelFieldId, typeFieldId } = inferDefinitionColumns(fields);
  const labelField = fields.find((field) => idOf(field) === labelFieldId);
  const typeField = fields.find((field) => idOf(field) === typeFieldId);
  if (labelField && typeField && nameOf(labelField) !== "name") {
    return {
      role: "role/ConfigurationTable",
      signal: t`Has ${labelField.name} and ${typeField.name} columns, like a table of field definitions`,
      confidence: "low",
    };
  }

  return null;
}

function inferFromName(name: string): RoleInference | null {
  const lowerName = name.toLowerCase();
  const rule = NAME_RULES.find(({ pattern }) => pattern.test(lowerName));
  return rule
    ? {
        role: rule.role,
        signal: t`Named like a ${getTableRoleLabel(rule.role).toLowerCase()} table`,
        confidence: rule.confidence,
      }
    : null;
}

/** How a row is identified, from the shape of the primary key */
export function inferRowIdentity(fields: Field[]): RowIdentity {
  const pks = fields.filter(isPK);
  if (pks.length === 0) {
    return "none";
  }
  if (pks.length > 1) {
    return "composite";
  }
  const [pk] = pks;
  if (matches(pk, HASH_KEY_RE)) {
    return "hash";
  }
  if (matches(pk, SURROGATE_KEY_RE) || (nameOf(pk) === "id" && isInteger(pk))) {
    return "surrogate";
  }
  return "natural";
}

export function inferPeriodGranularity({
  name,
  fields,
}: TableShape): PeriodGranularity {
  const dateKey = fields.find((field) => isPK(field) && isDate(field));
  const hint = `${dateKey?.name ?? ""} ${name}`.toLowerCase();
  return (
    PERIOD_GRANULARITIES.find((granularity) => hint.includes(granularity)) ??
    "day"
  );
}

const idOf = (field: Field | undefined) =>
  field ? getRawTableFieldId(field) : null;

export function inferHistoryBinding(fields: Field[]): HistoryBinding {
  const pks = fields.filter(isPK);
  const durableKey =
    pks.find((field) => !isDate(field) && !matches(field, VERSION_RE)) ??
    fields.find(isFK) ??
    pks[0];
  return {
    durableKeyFieldId: idOf(durableKey),
    validFromFieldId: idOf(
      fields.find((field) => matches(field, VALID_FROM_RE)),
    ),
    validToFieldId: idOf(fields.find((field) => matches(field, VALID_TO_RE))),
    currentFlagFieldId: idOf(
      fields.find((field) => matches(field, CURRENT_FLAG_RE)),
    ),
    currentRowsOnly: true,
  };
}

export function inferEavBinding(fields: Field[]): EavBinding {
  const entityKey =
    fields.find(isFK) ??
    fields.find((field) => !isPK(field) && nameOf(field).endsWith("_id"));
  return {
    entityKeyFieldId: idOf(entityKey),
    propertyFieldId: idOf(
      fields.find(
        (field) => field !== entityKey && matches(field, PROPERTY_RE),
      ),
    ),
    valueFieldId: idOf(fields.find((field) => matches(field, VALUE_RE))),
    definitionTableId: null,
    labelFieldId: null,
    typeFieldId: null,
  };
}

const findByPriority = (fields: Field[], patterns: RegExp[]) =>
  patterns
    .map((pattern) => fields.find((field) => matches(field, pattern)))
    .find((field) => field != null);

export function inferDefinitionColumns(fields: Field[]): DefinitionColumns {
  return {
    keyFieldId: idOf(findByPriority(fields, DEFINITION_KEY_RES)),
    labelFieldId: idOf(findByPriority(fields, DEFINITION_LABEL_RES)),
    typeFieldId: idOf(
      fields.find((field) => matches(field, DEFINITION_TYPE_RE)),
    ),
  };
}

const isConcreteTable = <T extends SchemaTable>(
  table: T,
): table is T & { id: ConcreteTableId } => typeof table.id === "number";

export function findTargetTable<T extends SchemaTable>(
  field: Field | undefined,
  schemaTables: T[],
) {
  const targetFieldId = field?.fk_target_field_id;
  return targetFieldId == null
    ? undefined
    : schemaTables
        .filter(isConcreteTable)
        .find((table) =>
          (table.fields ?? []).some(({ id }) => id === targetFieldId),
        );
}

export function inferEavDefinition(
  table: TableShape,
  propertyFieldId: FieldId | null,
  schemaTables: SchemaTable[],
): EavDefinitionInference {
  const propertyField = table.fields.find(
    (field) => idOf(field) === propertyFieldId,
  );
  const targetTable = findTargetTable(propertyField, schemaTables);
  const baseName = table.name
    .toLowerCase()
    .replace(DEFINITION_SIBLING_SUFFIX_RE, "");
  const siblingNames = [baseName, baseName.replace(/(^|_)custom_/, "$1")];
  const siblingTable = schemaTables
    .filter(isConcreteTable)
    .find(
      (candidate) =>
        candidate.name !== table.name &&
        siblingNames.includes(candidate.name.toLowerCase()),
    );
  const definitionTable = targetTable ?? siblingTable;
  if (!definitionTable) {
    return {
      definitionTableId: null,
      labelFieldId: null,
      typeFieldId: null,
      signal: t`No table of field definitions found`,
    };
  }
  const { labelFieldId, typeFieldId } = inferDefinitionColumns(
    definitionTable.fields ?? [],
  );
  return {
    definitionTableId: definitionTable.id,
    labelFieldId,
    typeFieldId,
    signal:
      targetTable && propertyField
        ? t`${propertyField.name} → ${definitionTable.name}`
        : t`Named like ${table.name} without its suffix`,
  };
}

export function inferCustomPropertyFacet(
  field: Pick<Field, "name">,
): CustomPropertyFacet | null {
  const match = WILDCARD_RE.exec(field.name.toLowerCase());
  return match ? { prefix: `${match[1]}_`, suffix: match[2] } : null;
}

export function inferWildcardDefinitionTable<T extends SchemaTable>(
  table: Pick<Table, "name">,
  schemaTables: T[],
) {
  const stem = table.name.toLowerCase().replace(/s$/, "");
  return schemaTables.filter(isConcreteTable).find((candidate) => {
    const { labelFieldId, typeFieldId } = inferDefinitionColumns(
      candidate.fields ?? [],
    );
    return (
      candidate.name.toLowerCase().startsWith(`${stem}_`) &&
      labelFieldId != null &&
      typeFieldId != null
    );
  });
}

/** The date a table is naturally viewed over time by, and why it was picked */
export type MainDateInference = {
  fieldId: FieldId | null;
  signal: string;
  /** Low-confidence guesses need an admin's review */
  confidence: "high" | "low";
};

// Load and edit bookkeeping, and the end of a validity range: never what a
// table is trended by
const BOOKKEEPING_DATE_RE =
  /^(_fivetran_synced|_fivetran_deleted|_fivetran_end|_loaded_at|_sdc_.*|_airbyte_.*)$|(^|_)(updated|modified|deleted|synced|loaded|extracted)(_at|_on|_date|_time)?$|^last_modified$/;

// Names that read as "when this happened", strongest first. A created date may
// be when the record was made rather than when the thing happened, so it's a
// weaker guess.
const EVENT_DATE_RES: {
  pattern: RegExp;
  confidence: MainDateInference["confidence"];
}[] = [
  {
    pattern: /(^|_)(occurred|happened|event)(_at|_time|_timestamp|_date)?$/,
    confidence: "high",
  },
  {
    pattern:
      /(^|_)(ordered|purchased|paid|transaction|invoice|booked|signed_up|subscribed)(_at|_date|_time)?$/,
    confidence: "high",
  },
  { pattern: /^(date|day|timestamp|ts|time)$/, confidence: "high" },
  {
    pattern: /(^|_)(created|inserted)(_at|_on|_date|_time)?$/,
    confidence: "low",
  },
];

/**
 * Picks the table's main date: a date in the key for periodic snapshots, then
 * the column whose name reads most like "when it happened", then the only
 * date left once bookkeeping columns are set aside.
 */
export function inferMainDate(
  fields: Field[],
  role: TableRole | null,
): MainDateInference {
  const candidates = fields.filter(
    (field) =>
      isDate(field) &&
      !matches(field, BOOKKEEPING_DATE_RE) &&
      !matches(field, VALID_TO_RE),
  );

  const keyDate = candidates.find(isPK);
  if (keyDate && role != null && isPeriodicRole(role)) {
    return {
      fieldId: idOf(keyDate),
      signal: t`The period in the table's key`,
      confidence: "high",
    };
  }

  for (const { pattern, confidence } of EVENT_DATE_RES) {
    const field = candidates.find((field) => matches(field, pattern));
    if (field) {
      return {
        fieldId: idOf(field),
        signal: t`Named like when a row happened`,
        confidence,
      };
    }
  }

  if (candidates.length === 1) {
    return {
      fieldId: idOf(candidates[0]),
      signal: t`The only date that isn't load or edit bookkeeping`,
      confidence: "low",
    };
  }

  return {
    fieldId: null,
    signal:
      candidates.length === 0
        ? t`No date column besides load or edit bookkeeping`
        : t`Several dates, none named like when a row happened`,
    // With no dates there's nothing to pick; with several, an admin should
    confidence: candidates.length === 0 ? "high" : "low",
  };
}

function isPeriodicRole(role: TableRole) {
  return (
    role === "role/PeriodicSnapshotFact" ||
    role === "role/UserDayFact" ||
    role === "role/CohortSnapshot"
  );
}
