import { useMemo } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Box, Button, Radio, Stack } from "metabase/ui";
import { useBooleanFilter } from "metabase/querying/hooks/use-boolean-filter";
import * as Lib from "metabase-lib";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { MIN_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const {
    optionType,
    isExpanded,
    availableOptions,
    getFilterClause,
    handleOptionTypeChange,
    handleIsExpandedChange,
  } = useBooleanFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const visibleOptions = useMemo(
    () =>
      isExpanded
        ? availableOptions
        : availableOptions.filter(option => !option.isAdvanced),
    [availableOptions, isExpanded],
  );

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
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      />
      <div>
        <Radio.Group value={optionType} onChange={handleOptionTypeChange}>
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
            onClick={() => handleIsExpandedChange(true)}
          >
            {t`More options`}
          </Button>
        )}
        <FilterPickerFooter isNew={isNew} canSubmit />
      </div>
    </Box>
  );
}
