import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { checkNotNull } from "metabase/lib/types";
import { Icon } from "metabase/core/components/Icon";
import { Box, Button, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { MIN_WIDTH } from "../constants";
import { getAvailableOperatorOptions } from "../utils";
import type { FilterPickerWidgetProps } from "../types";
import { OPTIONS } from "./constants";
import { getFilterClause, getOptionType } from "./utils";

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

  const options = useMemo(
    () => getAvailableOperatorOptions(query, stageIndex, column, OPTIONS),
    [query, stageIndex, column],
  );

  const [optionType, setOptionType] = useState(() =>
    getOptionType(query, stageIndex, filter),
  );

  const [isExpanded, setIsExpanded] = useState(
    () => OPTIONS[optionType].isAdvanced,
  );

  const visibleOptions = useMemo(() => {
    return isExpanded ? options : options.filter(option => !option.isAdvanced);
  }, [options, isExpanded]);

  const handleOptionChange = (type: string) => {
    const option = checkNotNull(options.find(option => option.type === type));
    setOptionType(option.type);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(getFilterClause(column, optionType));
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
        <Radio.Group value={optionType} onChange={handleOptionChange}>
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
