import { useMemo, useState } from "react";
import { t } from "ttag";

import { Combobox, Icon, TextInput, useCombobox } from "metabase/ui";

import type { SummaryBase, SummaryDefinition } from "./types";
import {
  addCountValue,
  addMetricValue,
  getAvailableMetrics,
  getItemKey,
  getMetricLabel,
} from "./utils";

const COUNT_OPTION_VALUE = "count";

type SummaryValuesInputProps = {
  base: SummaryBase;
  definition: SummaryDefinition;
  onChange: (definition: SummaryDefinition) => void;
};

/** Typeahead for adding values by name: the table's associated metrics, plus a row count. */
export function SummaryValuesInput({
  base,
  definition,
  onChange,
}: SummaryValuesInputProps) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const [searchText, setSearchText] = useState("");

  const metricOptions = useMemo(
    () =>
      getAvailableMetrics(base, searchText).map((metric) => ({
        value: getItemKey(base, metric),
        label: getMetricLabel(base, metric),
        metric,
      })),
    [base, searchText],
  );
  const countLabel = t`Count of rows`;
  const hasCountOption = countLabel
    .toLowerCase()
    .includes(searchText.trim().toLowerCase());

  const handleOptionSubmit = (optionValue: string) => {
    if (optionValue === COUNT_OPTION_VALUE) {
      onChange(addCountValue(definition));
    } else {
      const option = metricOptions.find(({ value }) => value === optionValue);
      if (option) {
        onChange(addMetricValue(base, definition, option.metric));
      }
    }
    setSearchText("");
    combobox.closeDropdown();
  };

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <TextInput
          size="sm"
          placeholder={t`Type a metric name…`}
          leftSection={<Icon name="metric" />}
          value={searchText}
          aria-label={t`Add a value by name`}
          onChange={(event) => {
            setSearchText(event.currentTarget.value);
            combobox.openDropdown();
            combobox.selectFirstOption();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options mah={280} style={{ overflowY: "auto" }}>
          {metricOptions.length > 0 && (
            <Combobox.Group label={t`Associated metrics`}>
              {metricOptions.map((option) => (
                <Combobox.Option key={option.value} value={option.value}>
                  {option.label}
                </Combobox.Option>
              ))}
            </Combobox.Group>
          )}
          {hasCountOption && (
            <Combobox.Group label={t`Basic`}>
              <Combobox.Option value={COUNT_OPTION_VALUE}>
                {countLabel}
              </Combobox.Option>
            </Combobox.Group>
          )}
          {metricOptions.length === 0 && !hasCountOption && (
            <Combobox.Empty>{t`No matching metrics`}</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
