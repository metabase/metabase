import { type KeyboardEvent, useMemo, useState } from "react";
import { t } from "ttag";

import { useListMeasuresQuery, useListMetricsQuery } from "metabase/api";
import {
  Combobox,
  Group,
  OptionsDropdown,
  Pill,
  PillsInput,
  useCombobox,
} from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import S from "./MetricPicker.module.css";
import type { MetricPickerItem } from "./types";
import { getItems } from "./utils";

type MetricPickerProps = {
  definitions: LibMetric.MetricDefinition[];
  onSelect: (item: MetricPickerItem) => void;
  onRemove: (
    definition: LibMetric.MetricDefinition,
    definitionIndex: number,
  ) => void;
};

export function MetricPicker({
  definitions,
  onSelect,
  onRemove,
}: MetricPickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const { data: metrics = [] } = useListMetricsQuery();
  const { data: measures = [] } = useListMeasuresQuery();

  const items = useMemo(
    () => getItems(definitions, metrics, measures),
    [definitions, metrics, measures],
  );

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex("active"),
  });

  const handleSelect = (value: string) => {
    const item = items.find((item) => item.value === value);
    if (item != null) {
      onSelect(item);
    }
  };

  const handleRemove = (definitionIndex: number) => {
    onRemove(definitions[definitionIndex], definitionIndex);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Backspace" && definitions.length > 0) {
      event.preventDefault();
      handleRemove(definitions.length - 1);
    }
  };

  return (
    <Combobox store={combobox} onOptionSubmit={handleSelect}>
      <Combobox.DropdownTarget>
        <PillsInput onClick={() => combobox.toggleDropdown()}>
          <Pill.Group>
            {definitions.map((definition, index) => (
              <MetricPill
                key={index}
                definition={definition}
                onRemove={() => handleRemove(index)}
              />
            ))}

            <Combobox.EventsTarget>
              <PillsInput.Field
                className={S.field}
                value={searchValue}
                placeholder={t`Pick a metric or a measure`}
                role="combobox"
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => combobox.closeDropdown()}
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <OptionsDropdown
        data={items}
        search={searchValue}
        nothingFoundMessage={t`No metrics or measures found`}
        renderOption={({ option }) => <MetricOption item={option} />}
        filter={undefined}
        limit={undefined}
        unstyled={false}
        labelId={undefined}
        withScrollArea={false}
        scrollAreaProps={undefined}
        maxDropdownHeight={undefined}
        aria-label={undefined}
      />
    </Combobox>
  );
}

type MetricPillProps = {
  definition: LibMetric.MetricDefinition;
  onRemove: () => void;
};

function MetricPill({ definition, onRemove }: MetricPillProps) {
  const metric = LibMetric.sourceMetricOrMeasureMetadata(definition);
  const metricInfo =
    metric != null ? LibMetric.displayInfo(definition, metric) : null;

  return (
    <Pill withRemoveButton onRemove={onRemove}>
      {metricInfo != null ? metricInfo.displayName : t`Unknown`}
    </Pill>
  );
}

type MetricOptionProps = {
  item: MetricPickerItem;
};

function MetricOption({ item }: MetricOptionProps) {
  return <Group>{item.label}</Group>;
}
