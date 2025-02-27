import cx from "classnames";
import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { ColorRangeSelector } from "metabase/core/components/ColorRangeSelector";
import { ColorSelector } from "metabase/core/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { Button, MultiSelect, Select, TextInputBlurChange } from "metabase/ui";
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

  const handleColumnChange = (columns: ColumnFormattingSetting["columns"]) => {
    const isFirstColumnAdd = rule.columns.length === 0 && columns.length === 1;

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
    <div>
      <h3 className={CS.mb1}>{t`Which columns should be affected?`}</h3>
      <MultiSelect
        comboboxProps={{ withinPortal: false }}
        value={rule.columns}
        onChange={handleColumnChange}
        defaultDropdownOpened={rule.columns.length === 0}
        placeholder={t`Choose a column`}
        data={cols.map(col => ({
          value: col.name,
          label: col.display_name,
          disabled: isFieldDisabled(col),
        }))}
      />
      {isNumericRule && !isKeyRule && (
        <div>
          <h3 className={cx(CS.mt3, CS.mb1)}>{t`Formatting style`}</h3>
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
        </div>
      )}
      {rule.type === "single" ? (
        <div>
          <h3 className={cx(CS.mt3, CS.mb1)}>
            {ngettext(
              msgid`When a cell in this column…`,
              `When any cell in these columns…`,
              selectedColumns.length,
            )}
          </h3>
          <Select<ColumnFormattingOperator>
            comboboxProps={{ withinPortal: false }}
            value={rule.operator}
            onChange={operator => onChange({ ...rule, operator })}
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
          <h3
            className={cx(CS.mt3, CS.mb1)}
          >{t`…turn its background this color:`}</h3>
          <ColorSelector
            data-testid="conditional-formatting-color-selector"
            value={rule.color}
            colors={COLORS}
            onChange={color => onChange({ ...rule, color })}
          />
          {canHighlightRow && (
            <>
              <h3
                className={cx(CS.mt3, CS.mb1)}
              >{t`Highlight the whole row`}</h3>

              <ChartSettingToggle
                value={rule.highlight_row}
                onChange={value =>
                  onChange({
                    ...rule,
                    highlight_row: value,
                  })
                }
              />
            </>
          )}
        </div>
      ) : rule.type === "range" ? (
        <div>
          <h3 className={cx(CS.mt3, CS.mb1)}>{t`Colors`}</h3>
          <ColorRangeSelector
            value={rule.colors}
            onChange={colors => {
              onChange({ ...rule, colors });
            }}
            colors={COLORS}
            colorRanges={COLOR_RANGES}
          />
          <h3 className={cx(CS.mt3, CS.mb1)}>{t`Start the range at`}</h3>
          <ChartSettingRadio
            value={rule.min_type}
            onChange={min_type =>
              onChange({
                ...rule,
                min_type: min_type as ColumnRangeFormattingSetting["min_type"],
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
          <h3 className={cx(CS.mt3, CS.mb1)}>{t`End the range at`}</h3>
          <ChartSettingRadio
            value={rule.max_type}
            onChange={max_type =>
              onChange({
                ...rule,
                max_type: max_type as ColumnRangeFormattingSetting["max_type"],
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
        </div>
      ) : null}
      <div className={CS.mt4}>
        {rule.columns.length === 0 ? (
          <Button variant="filled" onClick={onRemove}>
            {isNew ? t`Cancel` : t`Delete`}
          </Button>
        ) : (
          <Button variant="filled" onClick={onDone}>
            {isNew ? t`Add rule` : t`Update rule`}
          </Button>
        )}
      </div>
    </div>
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
