import cx from "classnames";
import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import ColorRangeSelector from "metabase/core/components/ColorRangeSelector";
import { ColorSelector } from "metabase/core/components/ColorSelector";
import {
  default as DeprecatedSelect,
  Option,
} from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Button,
  Select,
  Stack,
  Text,
  TextInputBlurChange,
} from "metabase/ui";
import type { TextInputBlurChangeProps } from "metabase/ui/components/inputs/TextInputBlurChange/TextInputBlurChange";
import { isBoolean } from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnFormattingOperator,
  ColumnFormattingSetting,
  ColumnRangeFormattingSetting,
  ColumnSingleFormattingSetting,
  ConditionalFormattingBooleanOperator,
  ConditionalFormattingComparisonOperator,
  DatasetColumn,
} from "metabase-types/api";

import { ChartSettingInputNumeric } from "../ChartSettingInputNumeric";
import { ChartSettingRadio } from "../ChartSettingRadio";
import { ChartSettingToggle } from "../ChartSettingToggle";

import { COLORS, COLOR_RANGES, DEFAULTS_BY_TYPE } from "./constants";
import { getOperatorsForColumns } from "./get-operators-for-columns";

interface RuleEditorProps {
  rule: ColumnFormattingSetting;
  cols: DatasetColumn[];
  isNew: boolean;
  onChange: (rule: ColumnFormattingSetting) => void;
  onDone: () => void;
  onRemove: () => void;
  canHighlightRow?: boolean;
}
interface SelectMultipleItemsReturned extends Array<string> {
  changedItem: string;
}

const INPUT_CLASSNAME = cx(CS.mt1, CS.full);

export const RuleEditor = ({
  rule,
  cols,
  isNew,
  onChange,
  onDone,
  onRemove,
  canHighlightRow = true,
}: RuleEditorProps) => {
  const selectedColumns = useMemo(
    () => rule.columns.map(name => _.findWhere(cols, { name })),
    [rule.columns, cols],
  );
  const { operators, isNumericRule, isKeyRule, isFieldDisabled } = useMemo(
    () => getOperatorsForColumns(selectedColumns),
    [selectedColumns],
  );
  const hasOperand =
    rule.type === "single" &&
    rule.operator !== "is-null" &&
    rule.operator !== "not-null" &&
    rule.operator !== "is-true" &&
    rule.operator !== "is-false";

  const handleColumnChange = (columns: SelectMultipleItemsReturned) => {
    const isFirstColumnAdd =
      columns.length === 1 && columns[0] === columns.changedItem;
    const operatorUpdate: {
      operator?:
        | ConditionalFormattingBooleanOperator
        | ConditionalFormattingComparisonOperator;
    } = isFirstColumnAdd
      ? {
          operator: isBoolean(_.findWhere(cols, { name: columns[0] }))
            ? "is-true"
            : "=",
        }
      : {};

    onChange({ ...rule, columns, ...operatorUpdate });
  };

  return (
    <Stack spacing="lg">
      <Stack spacing="xs">
        <Text fw="bold" fz="lg">{t`Which columns should be affected?`}</Text>
        <DeprecatedSelect
          value={rule.columns}
          onChange={(e: { target: { value: SelectMultipleItemsReturned } }) =>
            handleColumnChange(e.target.value)
          }
          isInitiallyOpen={rule.columns.length === 0}
          placeholder={t`Choose a column`}
          multiple
        >
          {cols.map(col => (
            <Option
              key={col.name}
              value={col.name}
              disabled={isFieldDisabled(col)}
            >
              {col.display_name}
            </Option>
          ))}
        </DeprecatedSelect>
      </Stack>
      {isNumericRule && !isKeyRule && (
        <Stack spacing="xs">
          <Text fw="bold" fz="lg">{t`Formatting style`}</Text>
          <ChartSettingRadio
            options={[
              { name: t`Single color`, value: "single" },
              { name: t`Color range`, value: "range" },
            ]}
            value={rule.type}
            onChange={type =>
              onChange({
                ...DEFAULTS_BY_TYPE[type as "single" | "range"],
                columns: rule.columns,
              })
            }
          />
        </Stack>
      )}
      {rule.type === "single" ? (
        <>
          <Stack spacing="xs">
            <Text fw="bold" fz="lg">
              {ngettext(
                msgid`When a cell in this column…`,
                `When any cell in these columns…`,
                selectedColumns.length,
              )}
            </Text>
            <Box>
              <Select
                value={rule.operator}
                onChange={(operator: ColumnFormattingOperator) =>
                  onChange({ ...rule, operator })
                }
                data={_.pairs(operators).map(([value, label]) => ({
                  value,
                  label,
                }))}
                data-testid="conditional-formatting-value-operator-button"
              />
              <RuleEditorValueInput
                hasOperand={hasOperand}
                isNumericRule={isNumericRule}
                isKeyRule={isKeyRule}
                rule={rule}
                onChange={onChange}
              />
            </Box>
          </Stack>
          <Stack spacing="xs" align="flex-start">
            <Text fw="bold" fz="lg">{t`…turn its background this color:`}</Text>

            <ColorSelector
              data-testid="conditional-formatting-color-selector"
              value={rule.color}
              colors={COLORS}
              onChange={color => onChange({ ...rule, color })}
            />
          </Stack>
          {canHighlightRow && (
            <Stack spacing="xs">
              <Text fw="bold" fz="lg">{t`Highlight the whole row`}</Text>

              <ChartSettingToggle
                value={rule.highlight_row}
                onChange={value =>
                  onChange({
                    ...rule,
                    highlight_row: value,
                  })
                }
              />
            </Stack>
          )}
        </>
      ) : rule.type === "range" ? (
        <>
          <Stack spacing="xs">
            <Text fw="bold" fz="lg">{t`Colors`}</Text>
            <ColorRangeSelector
              value={rule.colors}
              onChange={colors => {
                onChange({ ...rule, colors });
              }}
              colors={COLORS}
              colorRanges={COLOR_RANGES}
            />
          </Stack>
          <Stack spacing="xs">
            <Text fw="bold" fz="lg">{t`Start the range at`}</Text>
            <ChartSettingRadio
              value={rule.min_type}
              onChange={min_type =>
                onChange({
                  ...rule,
                  min_type:
                    min_type as ColumnRangeFormattingSetting["min_type"],
                })
              }
              options={(rule.columns.length <= 1
                ? [{ name: t`Smallest value in this column`, value: null }]
                : [
                    { name: t`Smallest value in each column`, value: null },
                    {
                      name: t`Smallest value in all of these columns`,
                      value: "all",
                    },
                  ]
              ).concat([{ name: t`Custom value`, value: "custom" }])}
            />
            {rule.min_type === "custom" && (
              <ChartSettingInputNumeric
                className={INPUT_CLASSNAME}
                value={rule.min_value}
                onChange={min_value =>
                  onChange({ ...rule, min_value: min_value ?? undefined })
                }
              />
            )}
          </Stack>
          <Stack spacing="xs">
            <Text fw="bold" fz="lg">{t`End the range at`}</Text>
            <ChartSettingRadio
              value={rule.max_type}
              onChange={max_type =>
                onChange({
                  ...rule,
                  max_type:
                    max_type as ColumnRangeFormattingSetting["max_type"],
                })
              }
              options={(rule.columns.length <= 1
                ? [{ name: t`Largest value in this column`, value: null }]
                : [
                    { name: t`Largest value in each column`, value: null },
                    {
                      name: t`Largest value in all of these columns`,
                      value: "all",
                    },
                  ]
              ).concat([{ name: t`Custom value`, value: "custom" }])}
            />
            {rule.max_type === "custom" && (
              <ChartSettingInputNumeric
                className={INPUT_CLASSNAME}
                value={rule.max_value}
                onChange={max_value =>
                  onChange({ ...rule, max_value: max_value ?? undefined })
                }
              />
            )}
          </Stack>
        </>
      ) : null}
      <Box>
        {rule.columns.length === 0 ? (
          <Button variant="filled" onClick={onRemove}>
            {isNew ? t`Cancel` : t`Delete`}
          </Button>
        ) : (
          <Button variant="filled" onClick={onDone}>
            {isNew ? t`Add rule` : t`Update rule`}
          </Button>
        )}
      </Box>
    </Stack>
  );
};

const RuleEditorValueInput = ({
  hasOperand,
  isNumericRule,
  isKeyRule,
  rule,
  onChange,
}: {
  hasOperand: boolean;
  isNumericRule: boolean;
  isKeyRule: boolean;
  rule: ColumnSingleFormattingSetting;
  onChange: (rule: ColumnFormattingSetting) => void;
}) => {
  if (!hasOperand) {
    return null;
  }

  const inputProps: Partial<TextInputBlurChangeProps> =
    isNumericRule && !isKeyRule
      ? {
          type: "number",
          placeholder: "0",
          onBlurChange: e =>
            onChange({ ...rule, value: e.target.valueAsNumber ?? "" }),
        }
      : {
          type: "text",
          placeholder: t`Column value`,
        };

  return (
    <TextInputBlurChange
      data-testid="conditional-formatting-value-input"
      className={INPUT_CLASSNAME}
      value={rule.value}
      onBlurChange={e => onChange({ ...rule, value: e.target.value })}
      {...inputProps}
    />
  );
};
