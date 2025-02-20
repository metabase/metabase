import cx from "classnames";
import { match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import ColorRangeSelector from "metabase/core/components/ColorRangeSelector";
import { ColorSelector } from "metabase/core/components/ColorSelector";
import CS from "metabase/css/core/index.css";
import { Button, MultiSelect, Select, TextInputBlurChange } from "metabase/ui";
import {
  isBoolean,
  isNumeric,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type {
  BooleanOperator,
  ColumnFormattingOperator,
  ColumnFormattingSetting,
  ColumnRangeFormattingSetting,
  DatasetColumn,
  NumberOperator,
} from "metabase-types/api";

import { ChartSettingInputNumeric } from "../ChartSettingInputNumeric";
import { ChartSettingRadio } from "../ChartSettingRadio";
import { ChartSettingToggle } from "../ChartSettingToggle";

import {
  BOOLEAN_OPERATIOR_NAMES,
  COLORS,
  COLOR_RANGES,
  COMMON_OPERATOR_NAMES,
  DEFAULTS_BY_TYPE,
  INPUT_CLASSNAME,
  NUMBER_OPERATOR_NAMES,
  STRING_OPERATOR_NAMES,
} from "./constants";

interface RuleEditorProps {
  rule: ColumnFormattingSetting;
  cols: DatasetColumn[];
  isNew: boolean;
  onChange: (rule: ColumnFormattingSetting) => void;
  onDone: () => void;
  onRemove: () => void;
  canHighlightRow?: boolean;
}

export const RuleEditor = ({
  rule,
  cols,
  isNew,
  onChange,
  onDone,
  onRemove,
  canHighlightRow = true,
}: RuleEditorProps) => {
  const selectedColumns = rule.columns.map(name => _.findWhere(cols, { name }));
  const hasBooleanRule =
    selectedColumns.length > 0 && selectedColumns.some(isBoolean);
  const isBooleanRule =
    selectedColumns.length > 0 && selectedColumns.every(isBoolean);
  const isStringRule =
    !hasBooleanRule &&
    selectedColumns.length > 0 &&
    selectedColumns.every(isString);
  const isNumericRule =
    !hasBooleanRule &&
    selectedColumns.length > 0 &&
    selectedColumns.every(isNumeric);

  const hasOperand =
    rule.type === "single" &&
    rule.operator !== "is-null" &&
    rule.operator !== "not-null" &&
    rule.operator !== "is-true" &&
    rule.operator !== "is-false";

  const handleColumnChange = (columns: ColumnFormattingSetting["columns"]) => {
    const isFirstColumnAdd = rule.columns.length === 0 && columns.length === 1;

    const operatorUpdate: { operator?: BooleanOperators | NumberOperators } =
      isFirstColumnAdd
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
          disabled:
            (isStringRule && (!isString(col) || isBoolean(col))) ||
            (isNumericRule && !isNumeric(col)) ||
            (isBooleanRule && !isBoolean(col)),
        }))}
      />
      {isNumericRule && (
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
                ...DEFAULTS_BY_TYPE[type],
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
          <Select
            comboboxProps={{ withinPortal: false }}
            value={rule.operator}
            onChange={operator => onChange({ ...rule, operator })}
            data={getOperatorOptions({
              isBooleanRule,
              isNumericRule,
              isStringRule,
            })}
            data-testid="conditional-formatting-value-operator-button"
          />
          {hasOperand && isNumericRule ? (
            <TextInputBlurChange
              data-testid="conditional-formatting-value-input"
              className={INPUT_CLASSNAME}
              type="number"
              value={rule.value}
              onBlurChange={e => onChange({ ...rule, value: e.target.value })}
              placeholder="0"
            />
          ) : hasOperand ? (
            <TextInputBlurChange
              data-testid="conditional-formatting-value-input"
              className={INPUT_CLASSNAME}
              value={rule.value}
              onBlurChange={e => onChange({ ...rule, value: e.target.value })}
              placeholder={t`Column value`}
            />
          ) : null}
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

const getOperatorOptions = (props: {
  isBooleanRule: boolean;
  isNumericRule: boolean;
  isStringRule: boolean;
}) =>
  _.pairs({
    ...COMMON_OPERATOR_NAMES,
    ...match(props)
      .with({ isBooleanRule: true }, () => BOOLEAN_OPERATIOR_NAMES)
      .with({ isNumericRule: true }, () => NUMBER_OPERATOR_NAMES)
      .with({ isStringRule: true }, () => STRING_OPERATOR_NAMES)
      .otherwise(() => ({})),
  }).map(([value, label]) => ({
    value,
    label,
  }));
