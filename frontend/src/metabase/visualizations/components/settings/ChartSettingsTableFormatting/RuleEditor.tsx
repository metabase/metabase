import cx from "classnames";
import { useMemo } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import NumericInput from "metabase/components/NumericInput";
import Button from "metabase/core/components/Button";
import ColorRangeSelector from "metabase/core/components/ColorRangeSelector";
import { ColorSelector } from "metabase/core/components/ColorSelector";
import Input from "metabase/core/components/Input";
import Radio from "metabase/core/components/Radio";
import Select, { Option } from "metabase/core/components/Select";
import Toggle from "metabase/core/components/Toggle";
import CS from "metabase/css/core/index.css";
import { Flex } from "metabase/ui";
import { isBoolean } from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnFormattingOperator,
  ColumnFormattingSetting,
  ConditionalFormattingBooleanOperator,
  ConditionalFormattingComparisonOperator,
  DatasetColumn,
} from "metabase-types/api";

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
    const _cols = columns.map(name => _.findWhere(cols, { name }));
    const operatorUpdate: {
      operator?:
        | ConditionalFormattingBooleanOperator
        | ConditionalFormattingComparisonOperator;
    } =
      columns.length === 1 && columns[0] === columns.changedItem
        ? {
            operator: _cols.every(isBoolean) ? "is-true" : "=",
          }
        : {};
    onChange({ ...rule, columns, ...operatorUpdate });
  };

  return (
    <div>
      <h3 className={CS.mb1}>{t`Which columns should be affected?`}</h3>
      <Select
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
      </Select>
      {isNumericRule && !isKeyRule && (
        <div>
          <h3 className={cx(CS.mt3, CS.mb1)}>{t`Formatting style`}</h3>
          <Radio
            value={rule.type}
            options={[
              { name: t`Single color`, value: "single" },
              { name: t`Color range`, value: "range" },
            ]}
            onChange={type =>
              onChange({
                ...DEFAULTS_BY_TYPE[type],
                columns: rule.columns,
              })
            }
            vertical
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
            disabled={selectedColumns.length === 0}
            value={rule.operator}
            onChange={(e: { target: { value: ColumnFormattingOperator } }) =>
              onChange({ ...rule, operator: e.target.value })
            }
            buttonProps={{
              "data-testid": "conditional-formatting-value-operator-button",
            }}
          >
            {Object.entries(operators).map(([operator, operatorName]) => (
              <Option key={operatorName} value={operator}>
                {operatorName}
              </Option>
            ))}
          </Select>
          {hasOperand && isNumericRule && !isKeyRule ? (
            <NumericInput
              disabled={selectedColumns.length === 0}
              data-testid="conditional-formatting-value-input"
              className={INPUT_CLASSNAME}
              type="number"
              value={rule.value}
              onChange={(value: string | number) =>
                onChange({ ...rule, value })
              }
              placeholder="0"
            />
          ) : hasOperand ? (
            <Input
              disabled={selectedColumns.length === 0}
              data-testid="conditional-formatting-value-input"
              className={INPUT_CLASSNAME}
              value={rule.value}
              onChange={e => onChange({ ...rule, value: e.target.value })}
              placeholder={t`Column value`}
            />
          ) : null}
          <h3
            className={cx(CS.mt3, CS.mb1)}
          >{t`…turn its background this color:`}</h3>
          <Flex align="left">
            <ColorSelector
              data-testid="conditional-formatting-color-selector"
              value={rule.color}
              colors={COLORS}
              onChange={color => onChange({ ...rule, color })}
            />
          </Flex>
          {canHighlightRow && (
            <>
              <h3
                className={cx(CS.mt3, CS.mb1)}
              >{t`Highlight the whole row`}</h3>

              <Toggle
                value={rule.highlight_row}
                onChange={highlight_row => onChange({ ...rule, highlight_row })}
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
          <Radio
            value={rule.min_type}
            onChange={min_type => onChange({ ...rule, min_type })}
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
            vertical
          />
          {rule.min_type === "custom" && (
            <NumericInput
              className={INPUT_CLASSNAME}
              type="number"
              value={rule.min_value}
              onChange={(min_value: number) => onChange({ ...rule, min_value })}
            />
          )}
          <h3 className={cx(CS.mt3, CS.mb1)}>{t`End the range at`}</h3>
          <Radio
            value={rule.max_type}
            onChange={max_type => onChange({ ...rule, max_type })}
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
            vertical
          />
          {rule.max_type === "custom" && (
            <NumericInput
              className={INPUT_CLASSNAME}
              type="number"
              value={rule.max_value}
              onChange={(max_value: number) => onChange({ ...rule, max_value })}
            />
          )}
        </div>
      ) : null}
      <div className={CS.mt4}>
        {rule.columns.length === 0 ? (
          <Button primary onClick={onRemove}>
            {isNew ? t`Cancel` : t`Delete`}
          </Button>
        ) : (
          <Button primary onClick={onDone}>
            {isNew ? t`Add rule` : t`Update rule`}
          </Button>
        )}
      </div>
    </div>
  );
};
