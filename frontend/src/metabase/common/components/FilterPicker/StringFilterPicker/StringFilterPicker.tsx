import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Flex, Button, Checkbox } from "metabase/ui";
import * as Lib from "metabase-lib";

import FieldValuesWidget from "metabase/components/FieldValuesWidget";
import Field from "metabase-lib/metadata/Field";
import type { FilterPickerWidgetProps } from "../types";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { Footer } from "../Footer";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

import { isStringFilterValid } from "./utils";
import { stringFilterValueCountMap } from "./constants";

export function StringFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  const filterParts = filter
    ? Lib.stringFilterParts(query, stageIndex, filter)
    : null;

  const [operatorName, setOperatorName] =
    useState<Lib.StringFilterOperatorName>(
      filterParts
        ? filterParts.operator
        : (Lib.defaultFilterOperatorName(
            query,
            stageIndex,
            column,
          ) as Lib.StringFilterOperatorName),
    );

  const [values, setValues] = useState<string[]>(filterParts?.values ?? []);
  const [options, setOptions] = useState<Lib.StringFilterOptions>(
    filterParts?.options ?? {},
  );

  const handleOperatorChange = (
    newOperatorName: Lib.StringFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues([]);
    setOptions({});
  };

  const handleFilterChange = () => {
    if (operatorName && values.length) {
      onChange(
        Lib.stringFilterClause({
          operator: operatorName,
          column,
          values,
          options,
        }),
      );
    }
  };

  const placeholder = t`Enter a value`; // TODO: this logic was handled by MLv1 / TokenField

  const fieldId = useMemo(() => Lib._fieldId(column), [column]);

  const valueCount = stringFilterValueCountMap[operatorName];
  const isFilterValid = isStringFilterValid(operatorName, values);
  const hasValuesInput = valueCount !== 0;
  const hasCaseSensitiveOption = valueCount === 1;

  return (
    <>
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        <FilterOperatorPicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          value={operatorName}
          onChange={newOperator =>
            handleOperatorChange(newOperator as Lib.StringFilterOperatorName)
          }
        />
      </Header>
      {hasValuesInput && (
        <FlexWithScroll p="md" mah={300}>
          <FieldValuesWidget
            fields={[new Field({ id: fieldId })]} // TODO adapt for MLv2
            className="input"
            value={values}
            minWidth={"300px"}
            onChange={setValues}
            placeholder={placeholder}
            disablePKRemappingForSearch
            autoFocus
            multi={valueCount === "multiple"}
            disableSearch={valueCount !== "multiple"}
          />
        </FlexWithScroll>
      )}
      <Footer mt={valueCount === 0 ? -1 : undefined} /* to collapse borders */>
        {hasCaseSensitiveOption ? (
          <CaseSensitiveOption
            value={options["case-sensitive"] ?? false}
            onChange={newValue => setOptions({ "case-sensitive": newValue })}
          />
        ) : (
          <Box />
        )}
        <Button disabled={!isFilterValid} onClick={handleFilterChange}>
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
  );
}

function CaseSensitiveOption({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Flex align="center" px="sm">
      <Checkbox
        onChange={e => onChange(e.target.checked)}
        checked={value}
        size="xs"
        label={t`Case sensitive`}
      />
    </Flex>
  );
}
