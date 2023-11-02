import { useMemo, useState } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Button, Divider, Group, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import { BackButton } from "../BackButton";
import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { OPTIONS } from "./constants";
import { getFilterClause, getOptionType } from "./utils";
import type { OptionType } from "./types";

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
    setOptionType(type as OptionType);
  };

  const handleSubmit = () => {
    onChange(getFilterClause(column, optionType));
  };

  return (
    <div>
      <BackButton onClick={onBack}>{columnInfo.longDisplayName}</BackButton>
      <Divider />
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
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" onClick={handleSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
