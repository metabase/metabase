import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import type { NumberOrEmptyValue } from "metabase/querying/filters/hooks/use-number-filter";
import { Box, Flex, Icon, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { NumberFilterInput } from "../../NumberFilterInput";
import { COMBOBOX_PROPS } from "../constants";

import S from "./NumberFilterPicker.module.css";

interface NumberValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
  leftInclusive?: boolean;
  rightInclusive?: boolean;
  onLeftInclusiveChange: (value: boolean) => void;
  onRightInclusiveChange: (value: boolean) => void;
}

function NumberValueInput({
  query,
  stageIndex,
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
  leftInclusive = true,
  rightInclusive = true,
  onLeftInclusiveChange,
  onRightInclusiveChange,
}: NumberValueInputProps) {
  if (hasMultipleValues) {
    return (
      <Box p="md" mah="25vh" style={{ overflow: "auto" }}>
        <NumberFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values.filter(isNotNull)}
          autoFocus
          comboboxProps={COMBOBOX_PROPS}
          onChange={onChange}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Enter a number`}
          autoFocus
          w="100%"
          aria-label={t`Filter value`}
          onChange={(newValue) => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex direction="column" p="md" gap="md">
        <NumberFilterInput
          value={values[0]}
          w="100%"
          placeholder={t`Start of range`}
          aria-label={t`Start of range`}
          autoFocus
          onChange={(newValue) => onChange([newValue, values[1]])}
          leftSection={
            <ToggleButton
              aria-label="toggle greater inclusiveness"
              onChange={() => onLeftInclusiveChange(!leftInclusive)}
            >
              <Icon
                name={leftInclusive ? "greater_than_or_equal" : "greater_than"}
              />
            </ToggleButton>
          }
          classNames={{
            root: S.root,
            input: S.input,
          }}
        />
        <NumberFilterInput
          value={values[1]}
          placeholder={t`End of range`}
          aria-label={t`End of range`}
          onChange={(newValue) => onChange([values[0], newValue])}
          leftSection={
            <ToggleButton
              aria-label="toggle less inclusiveness"
              onChange={() => onRightInclusiveChange(!rightInclusive)}
            >
              <Icon
                name={rightInclusive ? "less_than_or_equal" : "less_than"}
              />
            </ToggleButton>
          }
          classNames={{
            root: S.root,
            input: S.input,
          }}
        />
        <Text size="sm" c="text-secondary">
          {t`You can leave one of these fields blank`}
        </Text>
      </Flex>
    );
  }

  return null;
}

function ToggleButton({
  children,
  onChange,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  onChange: () => void;
}) {
  return (
    <Flex
      className={S.toggleButton}
      component="span"
      align="center"
      justify="center"
      h="100%"
      miw="40px"
      c="text-primary"
      fz="18px"
      tabIndex={0}
      role="button"
      onClick={onChange}
      onKeyDown={(event) => {
        if (event.key === " ") {
          onChange();
        }
      }}
      {...rest}
    >
      {children}
    </Flex>
  );
}

export { NumberValueInput };
