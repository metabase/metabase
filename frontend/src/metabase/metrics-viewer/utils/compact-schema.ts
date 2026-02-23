type RequiredField = string;

type OptionalField = { key: string; optional: true };

type DefaultField = { key: string; default: unknown };

type NestedField = { key: string; schema: CompactSchema<unknown> };

type NestedDefaultField = {
  key: string;
  schema: CompactSchema<unknown>;
  default: unknown[];
};

export type FieldDescriptor =
  | RequiredField
  | OptionalField
  | DefaultField
  | NestedField
  | NestedDefaultField;

export type SchemaConfig<T> = { [K in keyof T]-?: FieldDescriptor };

export interface CompactSchema<T> {
  compact(value: T): Record<string, unknown>;
  expand(raw: unknown): T | null;
}

interface NormalizedField {
  compactKey: string;
  optional: boolean;
  defaultValue: unknown;
  hasDefault: boolean;
  schema: CompactSchema<unknown> | null;
}

function isObjectDescriptor(
  descriptor: FieldDescriptor,
): descriptor is
  | OptionalField
  | DefaultField
  | NestedField
  | NestedDefaultField {
  return typeof descriptor !== "string";
}

function normalizeDescriptor(descriptor: FieldDescriptor): NormalizedField {
  if (!isObjectDescriptor(descriptor)) {
    return {
      compactKey: descriptor,
      optional: false,
      defaultValue: undefined,
      hasDefault: false,
      schema: null,
    };
  }

  const hasDefault = "default" in descriptor;
  const hasSchema = "schema" in descriptor;

  return {
    compactKey: descriptor.key,
    optional: "optional" in descriptor && descriptor.optional === true,
    defaultValue: hasDefault
      ? (descriptor as DefaultField | NestedDefaultField).default
      : undefined,
    hasDefault,
    schema: hasSchema ? (descriptor as NestedField).schema : null,
  };
}

export function defineCompactSchema<T>(
  config: SchemaConfig<T>,
): CompactSchema<T> {
  const entries = Object.entries(config) as [string, FieldDescriptor][];
  const normalized = entries.map(
    ([fullKey, descriptor]) =>
      [fullKey, normalizeDescriptor(descriptor)] as const,
  );

  return {
    compact(value: T): Record<string, unknown> {
      const result: Record<string, unknown> = {};

      for (const [fullKey, field] of normalized) {
        const val = (value as Record<string, unknown>)[fullKey];

        if (field.optional && val === undefined) {
          continue;
        }

        if (field.schema && Array.isArray(val)) {
          result[field.compactKey] = val.map((item) =>
            field.schema!.compact(item),
          );
        } else {
          result[field.compactKey] = val;
        }
      }

      return result;
    },

    expand(raw: unknown): T | null {
      if (!raw || typeof raw !== "object") {
        return null;
      }

      const obj = raw as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const [fullKey, field] of normalized) {
        const val = obj[field.compactKey];

        if (val === undefined) {
          if (field.optional) {
            continue;
          }
          if (field.hasDefault) {
            result[fullKey] = field.defaultValue;
            continue;
          }
          return null;
        }

        if (field.schema) {
          if (Array.isArray(val)) {
            result[fullKey] = val
              .map((item) => field.schema!.expand(item))
              .filter((item): item is NonNullable<typeof item> => item != null);
          } else {
            result[fullKey] = field.hasDefault ? field.defaultValue : [];
          }
        } else {
          result[fullKey] = val;
        }
      }

      return result as T;
    },
  };
}
