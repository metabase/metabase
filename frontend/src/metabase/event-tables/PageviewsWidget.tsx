import { useState } from "react";
import { t } from "ttag";

import {
  Group,
  Select,
  type SelectOption,
  Stack,
  TextInput,
} from "metabase/ui";
import { isNumericBaseType } from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { getColumnOptions } from "./column-roles";
import {
  type ColumnValuePageviewRule,
  EVERY_EVENT,
  type PageviewRule,
} from "./pageviews";
import type { SettingWidgetProps } from "./settings/types";

type PageviewMode = "none" | PageviewRule["type"];

const getMode = (rule: PageviewRule | null): PageviewMode =>
  rule?.type ?? "none";

const getModeOptions = (): SelectOption<PageviewMode>[] => [
  { value: "none", label: t`None` },
  { value: "every_event", label: t`Every event` },
  { value: "column_value", label: t`Events where a column has a value` },
];

type PageviewsWidgetProps = SettingWidgetProps<PageviewRule | null> & {
  table: Table | undefined;
  /** The column a new rule starts on: pageviews are usually an event name. */
  eventNameColumn: string | null;
};

export const PageviewsWidget = ({
  id,
  value,
  onChange,
  table,
  eventNameColumn,
}: PageviewsWidgetProps) => {
  // A rule on a column isn't saved until it has a value.
  const [isDraftingColumnValue, setIsDraftingColumnValue] = useState(false);
  const mode = isDraftingColumnValue ? "column_value" : getMode(value);

  const handleModeChange = (newMode: PageviewMode) => {
    setIsDraftingColumnValue(
      newMode === "column_value" && value?.type !== "column_value",
    );
    if (newMode === "none") {
      onChange(null);
    } else if (newMode === "every_event") {
      onChange(EVERY_EVENT);
    }
  };

  const handleRuleChange = (rule: ColumnValuePageviewRule) => {
    setIsDraftingColumnValue(false);
    onChange(rule);
  };

  const rule = value?.type === "column_value" ? value : undefined;

  return (
    <Stack gap="sm">
      <Select
        id={id}
        data={getModeOptions()}
        value={mode}
        allowDeselect={false}
        onChange={handleModeChange}
      />
      {mode === "column_value" && (
        <ColumnValueFields
          // A new rule from outside, such as an undo, replaces the draft.
          key={JSON.stringify(rule)}
          rule={rule}
          initialColumn={rule?.column ?? eventNameColumn}
          table={table}
          onChange={handleRuleChange}
        />
      )}
    </Stack>
  );
};

/** Undefined while the text isn't a value the column can hold. */
const parseValue = (
  field: Field,
  text: string,
): string | number | undefined => {
  const trimmed = text.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (!isNumericBaseType(field)) {
    return trimmed;
  }
  const asNumber = Number(trimmed);
  return Number.isFinite(asNumber) ? asNumber : undefined;
};

type ColumnValueFieldsProps = {
  rule: ColumnValuePageviewRule | undefined;
  initialColumn: string | null;
  table: Table | undefined;
  onChange: (rule: ColumnValuePageviewRule) => void;
};

const ColumnValueFields = ({
  rule,
  initialColumn,
  table,
  onChange,
}: ColumnValueFieldsProps) => {
  const [column, setColumn] = useState(initialColumn);
  const [text, setText] = useState(
    rule !== undefined ? String(rule.value) : "",
  );

  const commit = (newColumn: string | null, newText: string) => {
    const field = table?.fields?.find(({ name }) => name === newColumn);
    const value = field !== undefined ? parseValue(field, newText) : undefined;
    const isChanged = newColumn !== rule?.column || value !== rule?.value;
    if (newColumn !== null && value !== undefined && isChanged) {
      onChange({ type: "column_value", column: newColumn, value });
    }
  };

  // The old value rarely means anything on another column, so it's cleared
  // instead of saved with it.
  const handleColumnChange = (newColumn: string | null) => {
    setColumn(newColumn);
    setText("");
  };

  return (
    <Group gap="sm" wrap="nowrap">
      <Select
        aria-label={t`Pageview column`}
        data={getColumnOptions(table)}
        value={column}
        placeholder={t`Pick a column`}
        searchable
        flex={1}
        onChange={handleColumnChange}
      />
      <TextInput
        aria-label={t`Pageview value`}
        value={text}
        placeholder={t`Value`}
        flex={1}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => commit(column, text)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(column, text);
          }
        }}
      />
    </Group>
  );
};
