import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import type { OptionType } from "metabase/common/hooks/filters/use-boolean-filter";
import { useBooleanFilter } from "metabase/common/hooks/filters/use-boolean-filter";
import { Icon } from "metabase/core/components/Icon";
import { Box, Button, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { MIN_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

function isAdvancedOptionType(optionType: OptionType) {
  return optionType === "is-null" || optionType === "not-null";
}

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;

  const { value, options, setOption, getFilterClause } = useBooleanFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const [isExpanded, setIsExpanded] = useState(() =>
    isAdvancedOptionType(value),
  );

  const visibleOptions = useMemo(() => {
    return isExpanded
      ? options
      : options.filter(option => !isAdvancedOptionType(option.type));
  }, [options, isExpanded]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(getFilterClause());
  };

  return (
    <Box
      component="form"
      miw={MIN_WIDTH}
      data-testid="boolean-filter-picker"
      onSubmit={handleSubmit}
    >
      <FilterPickerHeader columnName={columnName} onBack={onBack} />
      <div>
        <Radio.Group value={value} onChange={setOption}>
          <Stack p="md" pb={isExpanded ? "md" : 0} spacing="sm">
            {visibleOptions.map(option => (
              <Radio
                key={option.type}
                value={option.type}
                label={option.name}
                pb={6}
                size="xs"
              />
            ))}
          </Stack>
        </Radio.Group>
        {!isExpanded && (
          <Button
            c="text.1"
            variant="subtle"
            aria-label={t`More options`}
            rightIcon={<Icon name="chevrondown" />}
            onClick={() => setIsExpanded(true)}
          >
            {t`More options`}
          </Button>
        )}
        <FilterPickerFooter isNew={isNew} canSubmit />
      </div>
    </Box>
  );
}
