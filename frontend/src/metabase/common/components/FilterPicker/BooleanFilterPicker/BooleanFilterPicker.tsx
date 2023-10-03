import { t } from "ttag";
import { useMemo, useState } from "react";
import { Box, Button, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { Footer } from "../Footer";
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
    <>
      <Header>
        <BackButton onClick={onBack}>{columnInfo.displayName}</BackButton>
      </Header>
      <Stack p="md">
        <Radio.Group value={optionType} onChange={handleOptionChange}>
          {visibleOptions.map(option => (
            <Radio
              key={option.type}
              value={option.type}
              label={option.name}
              pb={6}
              size="xs"
            />
          ))}
        </Radio.Group>
        {!isExpanded && (
          <Button variant="subtle" onClick={() => setIsExpanded(true)}>
            {t`More options`}
          </Button>
        )}
      </Stack>
      <Footer>
        <Box />
        <Button onClick={handleSubmit}>
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
  );
}
