import { match } from "ts-pattern";
import { t } from "ttag";

import {
  MultiSelect,
  NumberInput,
  Select,
  Switch,
  TagsInput,
  TextInput,
  Textarea,
} from "metabase/ui";

import type { DataCheckParamSpec, DataCheckValue } from "../../types";
import { isDataCheckRecord } from "../../utils";

type DataCheckParamFieldProps = {
  spec: DataCheckParamSpec;
  value: DataCheckValue | undefined;
  columns: readonly string[];
  tables: readonly string[];
  onChange: (value: DataCheckValue | undefined) => void;
};

export function DataCheckParamField({
  spec,
  value,
  columns,
  tables,
  onChange,
}: DataCheckParamFieldProps) {
  const common = { label: spec.name, required: spec.required };
  const text = getText(value);
  const handleText = (next: string) => onChange(next === "" ? undefined : next);
  const handleNumber = (next: string | number) =>
    onChange(typeof next === "number" ? next : undefined);

  return match(spec.type)
    .with("column", () => (
      <Select
        {...common}
        data={withCurrent(columns, text)}
        value={text || null}
        onChange={(next) => onChange(next ?? undefined)}
        searchable
      />
    ))
    .with("columns", () => (
      <MultiSelect
        {...common}
        data={[...columns]}
        value={getList(value)}
        onChange={onChange}
      />
    ))
    .with("table_ref", () => (
      <Select
        {...common}
        data={withCurrent(tables, text)}
        value={text || null}
        onChange={(next) => onChange(next ?? undefined)}
        searchable
      />
    ))
    .with("column_ref", () => (
      <TextInput
        {...common}
        placeholder="table.column"
        value={text}
        onChange={(event) => handleText(event.target.value)}
      />
    ))
    .with("integer", () => (
      <NumberInput
        {...common}
        allowDecimal={false}
        value={getNumber(value)}
        onChange={handleNumber}
      />
    ))
    .with("number", () => (
      <NumberInput
        {...common}
        value={getNumber(value)}
        onChange={handleNumber}
      />
    ))
    .with("fraction", () => (
      <NumberInput
        {...common}
        description={t`A share between 0 and 1`}
        min={0}
        max={1}
        step={0.01}
        value={getNumber(value)}
        onChange={handleNumber}
      />
    ))
    .with("boolean", () => (
      <Switch
        label={spec.name}
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    ))
    .with("duration", () => (
      <TextInput
        {...common}
        placeholder={t`2 hours`}
        value={text}
        onChange={(event) => handleText(event.target.value)}
      />
    ))
    .with("date", () => (
      <TextInput
        {...common}
        description={
          isDataCheckRecord(value)
            ? t`A SQL expression`
            : t`An ISO date or timestamp`
        }
        value={text}
        onChange={(event) =>
          onChange(
            isDataCheckRecord(value)
              ? { sql: event.target.value }
              : event.target.value || undefined,
          )
        }
      />
    ))
    .with("sql", () => (
      <Textarea
        {...common}
        description={t`SQL, passed through as written`}
        autosize
        minRows={2}
        styles={{
          input: { fontFamily: "var(--mb-default-monospace-font-family)" },
        }}
        value={text}
        onChange={(event) => handleText(event.target.value)}
      />
    ))
    .with("list", () => (
      <TagsInput {...common} value={getList(value)} onChange={onChange} />
    ))
    .with("enum", () => (
      <Select
        {...common}
        data={withCurrent(spec.options ?? [], text)}
        value={text || null}
        onChange={(next) => onChange(next ?? undefined)}
        clearable={!spec.required}
      />
    ))
    .with("string", () => (
      <TextInput
        {...common}
        value={text}
        onChange={(event) => handleText(event.target.value)}
      />
    ))
    .exhaustive();
}

function getText(value: DataCheckValue | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (isDataCheckRecord(value) && typeof value.sql === "string") {
    return value.sql;
  }
  return "";
}

function getNumber(value: DataCheckValue | undefined): number | string {
  return typeof value === "number" ? value : "";
}

function getList(value: DataCheckValue | undefined): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function withCurrent(options: readonly string[], current: string): string[] {
  return current === "" || options.includes(current)
    ? [...options]
    : [...options, current];
}
