import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import Markdown from "metabase/common/components/Markdown";
import { useSetting } from "metabase/common/hooks";
import {
  dateStyleOption,
  getDateStyleOptionsForUnit,
} from "metabase/lib/formatting";
import { Autocomplete, Stack, Text } from "metabase/ui";
import type { DatetimeUnit } from "metabase-types/api";

export function DateFormatInput({
  value,
  onChange,
  unit = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  unit?: DatetimeUnit;
}) {
  const formattingSettings = useSetting("custom-formatting");

  const dateStyleOptionValues = useMemo(() => {
    const dateAbbreviate =
      formattingSettings?.["type/Temporal"]?.date_abbreviate;
    const dateFormatSetting =
      formattingSettings?.["type/Temporal"]?.date_style ?? "";
    const dateStyleOptions = getDateStyleOptionsForUnit(unit, dateAbbreviate);
    return _.uniq([
      dateStyleOption(dateFormatSetting, unit, dateAbbreviate),
      ...dateStyleOptions.map(({ value }) => value),
    ]).filter(Boolean);
  }, [formattingSettings, unit]);

  const debouncedChange = _.debounce(onChange, 500);

  const [localValue, setLocalValue] = useState(value);

  return (
    <Stack gap="xs">
      <Autocomplete
        id="date_style"
        label={t`Date style`}
        value={localValue}
        comboboxProps={{
          withinPortal: false,
          floatingStrategy: "fixed",
        }}
        description={
          <Markdown>
            {t`Select one of the preset date formats or provide your own using [custom date format options](https://day.js.org/docs/en/display/format).`}
          </Markdown>
        }
        onAuxClickCapture={(e) => e.preventDefault()}
        onChange={(newValue) => {
          setLocalValue(newValue);
          debouncedChange(newValue);
        }}
        data={dateStyleOptionValues}
        renderOption={({ option }) => (
          <DateFormatOptionDisplay format={option?.value || ""} />
        )}
      />
      <DateFormatPreview format={value ?? ""} />
    </Stack>
  );
}
const DateFormatOptionDisplay = ({ format }: { format: string }) => {
  return (
    <Text p="sm" fz="sm">
      <Text>{format}</Text>{" "}
      <Text c="text-medium">({dayjs("2018-01-31").format(format)})</Text>
    </Text>
  );
};

const DateFormatPreview = ({ format }: { format: string }) => {
  return (
    <Text>
      {c("{0} is a preview of a formatted date")
        .t`Preview: ${dayjs("2018-01-31").format(format)}`}
    </Text>
  );
};
