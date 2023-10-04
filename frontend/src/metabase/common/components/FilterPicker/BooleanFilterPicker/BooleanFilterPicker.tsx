import { useMemo, useState } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Button, Divider, Group, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { getFilterClause, getOptions, getOptionType } from "./utils";
import type { OptionType } from "./types";

export function BooleanFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const options = useMemo(() => {
    return getOptions(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const [optionType, setOptionType] = useState(() =>
    getOptionType(query, stageIndex, filter),
  );

  const [isExpanded, setIsExpanded] = useState(() =>
    options.some(option => option.type === optionType && option.isAdvanced),
  );

  const visibleOptions = useMemo(() => {
    return isExpanded ? options : options.filter(option => !option.isAdvanced);
  }, [options, isExpanded]);

  const handleOptionChange = (type: string) => {
    setOptionType(type as OptionType);
  };

  const handleSubmit = () => {
    onChange(getFilterClause(column, optionType));
  };

  return (
    <div>
      <Button
        c="text.2"
        fz="1rem"
        variant="subtle"
        leftIcon={<Icon name="chevronleft" />}
        onClick={onBack}
      >
        {columnInfo.displayName}
      </Button>
      <Divider />
      <Radio.Group value={optionType} onChange={handleOptionChange}>
        <Stack p="md" spacing="sm">
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
          rightIcon={<Icon name="chevrondown" />}
          onClick={() => setIsExpanded(true)}
        >
          {t`More options`}
        </Button>
      )}
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" onClick={handleSubmit}>
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Group>
    </div>
  );
}
