/* eslint-disable react/prop-types */
import { DATE_OPERATORS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { DATE_SHORTCUT_OPTIONS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import type { SearchFilterDropdown } from "metabase/search/types";
import { CreatedAtDatePicker } from "./CreatedAtContent.styled";

const CREATED_AT_FILTERS = DATE_OPERATORS.filter(
  ({ name }) => name !== "exclude",
);

const CREATED_AT_SHORTCUTS = {
  ...DATE_SHORTCUT_OPTIONS,
  MISC_OPTIONS: DATE_SHORTCUT_OPTIONS.MISC_OPTIONS.filter(
    ({ displayName }) => displayName !== "Exclude…",
  ),
};

export const CreatedAtContent: SearchFilterDropdown<"created_at">["ContentComponent"] =
  ({ value, onChange }) => (
    <CreatedAtDatePicker
      value={value}
      setValue={(value: string | null) => onChange(value ?? undefined)}
      operators={CREATED_AT_FILTERS}
      dateShortcutOptions={CREATED_AT_SHORTCUTS}
      withPadding={false}
    />
  );
