import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type {
  ConcreteTableId,
  Field,
  FieldId,
  Table,
} from "metabase-types/api";

import type { ScdType, ScdTypeInference } from "./history-source";

export const HISTORY_TABLE_SCD_TYPES = [2, 4, 6, 7] as const;
export const CURRENT_TABLE_SCD_TYPES = [1, 3] as const;

export type ScdDetailsOverrides = {
  currentTableId?: ConcreteTableId | null;
  currentValueFieldIds?: FieldId[];
};

export type PreviousValuePair = { field: Field; previousField: Field };

export type FactKeyField = { table: Table; field: Field };

export type ScdTypeResolution = {
  scdType: ScdType | null;
  signal: string;
  isOverridden: boolean;
  confidence: ScdTypeInference["confidence"];
};

type ScdTypeSource = {
  scdType: ScdType | null;
  scdTypeInference: ScdTypeInference;
  isScdTypeOverridden: boolean;
};

const PREVIOUS_VALUE_RES = [
  /^(?:previous|prior|prev|old)_(.+)$/,
  /^(.+)_(?:previous|prior|prev)$/,
];
const CURRENT_VALUE_RES = [/^current_(.+)$/, /^(.+)_current$/];
const HISTORY_TABLE_SUFFIX_RE = /_(history|hist|snapshots?|versions?|changes)$/;
const FACT_TABLE_RE = /^(fct|fact|f)_/;

const nameOf = (field: Field) => field.name.toLowerCase();

function findBaseField(fields: Field[], field: Field, patterns: RegExp[]) {
  const baseName = patterns
    .map((pattern) => nameOf(field).match(pattern)?.[1])
    .find((name) => name != null);
  return baseName == null
    ? undefined
    : fields.find((other) => other !== field && nameOf(other) === baseName);
}

export function inferPreviousValuePairs(fields: Field[]): PreviousValuePair[] {
  return fields.flatMap((previousField) => {
    const field = findBaseField(fields, previousField, PREVIOUS_VALUE_RES);
    return field ? [{ field, previousField }] : [];
  });
}

export function inferCurrentValueFields(fields: Field[]): Field[] {
  return fields.filter(
    (field) => findBaseField(fields, field, CURRENT_VALUE_RES) != null,
  );
}

export function inferCurrentTable(
  table: Pick<Table, "id" | "name" | "schema">,
  tables: Table[],
): Table | undefined {
  const name = table.name.toLowerCase();
  const baseName = name.replace(HISTORY_TABLE_SUFFIX_RE, "");
  if (baseName === name) {
    return undefined;
  }
  const candidates = [baseName, `${baseName}s`, baseName.replace(/s$/, "")];
  return tables.find(
    (other) =>
      other.id !== table.id &&
      other.schema === table.schema &&
      candidates.includes(other.name.toLowerCase()),
  );
}

export function inferFactKeyFields(
  table: Pick<Table, "id">,
  durableKeyField: Field | undefined,
  tables: Table[],
): FactKeyField[] {
  if (durableKeyField == null) {
    return [];
  }
  const durableKeyFieldId = getRawTableFieldId(durableKeyField);
  return tables
    .filter((other) => other.id !== table.id)
    .flatMap((other) =>
      (other.fields ?? [])
        .filter(
          (field) =>
            field.fk_target_field_id === durableKeyFieldId ||
            (FACT_TABLE_RE.test(other.name.toLowerCase()) &&
              nameOf(field) === nameOf(durableKeyField)),
        )
        .map((field) => ({ table: other, field })),
    );
}

const fieldNames = (fields: Field[]) =>
  fields.map((field) => field.name).join(", ");

export function resolveHistoryScdType(
  source: ScdTypeSource,
  {
    currentValueFields,
    currentTable,
  }: { currentValueFields: Field[]; currentTable: Table | undefined },
): ScdTypeResolution {
  if (source.isScdTypeOverridden) {
    return {
      scdType: source.scdType,
      signal: t`Set by an admin`,
      isOverridden: true,
      confidence: "high",
    };
  }
  if (currentValueFields.length > 0) {
    return {
      scdType: 6,
      signal: t`${fieldNames(currentValueFields)} hold today's value on every version`,
      isOverridden: false,
      confidence: "high",
    };
  }
  if (currentTable != null) {
    return {
      scdType: 4,
      signal: t`${currentTable.name} holds the current rows`,
      isOverridden: false,
      confidence: "high",
    };
  }
  return {
    scdType: source.scdTypeInference.scdType,
    signal: source.scdTypeInference.signal,
    isOverridden: false,
    confidence: source.scdTypeInference.confidence,
  };
}

export function resolveCurrentTableScdType(
  source: Pick<ScdTypeSource, "scdType" | "isScdTypeOverridden">,
  previousValuePairs: PreviousValuePair[],
): ScdTypeResolution {
  if (source.isScdTypeOverridden) {
    return {
      scdType: source.scdType,
      signal: t`Set by an admin`,
      isOverridden: true,
      confidence: "high",
    };
  }
  if (previousValuePairs.length > 0) {
    return {
      scdType: 3,
      signal: t`${fieldNames(previousValuePairs.map(({ previousField }) => previousField))} keep the value before the last change`,
      isOverridden: false,
      confidence: "high",
    };
  }
  return {
    scdType: 1,
    signal: t`No history or previous-value columns, so changes overwrite`,
    isOverridden: false,
    confidence: "high",
  };
}
