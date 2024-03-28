import type {
  DateTimeFieldFingerprint,
  Field,
  FieldDimension,
  FieldFingerprint,
  FieldGlobalFingerprint,
  GetFieldValuesResponse,
  NumberFieldFingerprint,
  TextFieldFingerprint,
} from "metabase-types/api";

export const createMockField = (opts?: Partial<Field>): Field => ({
  id: 1,

  name: "mock_field",
  display_name: "Mock Field",
  description: null,

  table_id: 1,

  base_type: "type/Text",
  semantic_type: "type/Text",
  fk_target_field_id: null,

  active: true,
  visibility_type: "normal",
  preview_display: true,
  position: 1,
  nfc_path: null,
  json_unfolding: null,
  coercion_strategy: null,
  fingerprint: null,

  has_field_values: "none",
  has_more_values: false,

  last_analyzed: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
});

export const createMockFieldValues = (
  opts?: Partial<GetFieldValuesResponse>,
): GetFieldValuesResponse => ({
  field_id: 1,
  values: [],
  has_more_values: false,
  ...opts,
});

export const createMockFingerprint = (
  opts?: Partial<FieldFingerprint>,
): FieldFingerprint => ({
  global: createMockGlobalFieldFingerprint(),
  ...opts,
});

export const createMockGlobalFieldFingerprint = (
  opts?: Partial<FieldGlobalFingerprint>,
): FieldGlobalFingerprint => ({
  "distinct-count": 0,
  "nil%": 0,
  ...opts,
});

export const createMockTextFieldFingerprint = (
  opts?: Partial<TextFieldFingerprint>,
): TextFieldFingerprint => ({
  "average-length": 0,
  "percent-email": 0,
  "percent-json": 0,
  "percent-state": 0,
  "percent-url": 0,
  ...opts,
});

export const createMockNumberFieldFingerprint = (
  opts?: Partial<NumberFieldFingerprint>,
): NumberFieldFingerprint => ({
  avg: 0,
  max: 0,
  min: 0,
  q1: 0,
  q3: 0,
  sd: 0,
  ...opts,
});

export const createMockDateTimeFieldFingerprint = (
  opts?: Partial<DateTimeFieldFingerprint>,
): DateTimeFieldFingerprint => ({
  earliest: "2000-01-01",
  latest: "2020-01-01",
  ...opts,
});

export const createMockFieldDimension = (
  opts?: Partial<FieldDimension>,
): FieldDimension => ({
  type: "internal",
  name: "mock_field",
  ...opts,
});
