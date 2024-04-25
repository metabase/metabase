/* eslint-disable react/prop-types */
import { PointerSensor, useSensor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import cx from "classnames";
import { useState, useMemo } from "react";
import { t, jt, msgid, ngettext } from "ttag";
import _ from "underscore";

import NumericInput from "metabase/components/NumericInput";
import Button from "metabase/core/components/Button";
import ColorRange from "metabase/core/components/ColorRange";
import ColorRangeSelector from "metabase/core/components/ColorRangeSelector";
import ColorSelector from "metabase/core/components/ColorSelector";
import Input from "metabase/core/components/Input";
import Radio from "metabase/core/components/Radio";
import Select, { Option } from "metabase/core/components/Select";
import { Sortable, SortableList } from "metabase/core/components/Sortable";
import Toggle from "metabase/core/components/Toggle";
import CS from "metabase/css/core/index.css";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  getAccentColors,
  getStatusColorRanges,
} from "metabase/lib/colors/groups";
import { Icon } from "metabase/ui";
import {
  isNumeric,
  isString,
  isBoolean,
} from "metabase-lib/v1/types/utils/isa";

const COMMON_OPERATOR_NAMES = {
  "is-null": t`is null`,
  "not-null": t`is not null`,
};

const NUMBER_OPERATOR_NAMES = {
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  "<": t`is less than`,
  ">": t`is greater than`,
  "<=": t`is less than or equal to`,
  ">=": t`is greater than or equal to`,
};

const STRING_OPERATOR_NAMES = {
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  contains: t`contains`,
  "does-not-contain": t`does not contain`,
  "starts-with": t`starts with`,
  "ends-with": t`ends with`,
};

const BOOLEAN_OPERATIOR_NAMES = {
  "is-true": t`is true`,
  "is-false": t`is false`,
};

export const ALL_OPERATOR_NAMES = {
  ...NUMBER_OPERATOR_NAMES,
  ...STRING_OPERATOR_NAMES,
  ...BOOLEAN_OPERATIOR_NAMES,
  ...COMMON_OPERATOR_NAMES,
};

// TODO
const COLORS = getAccentColors({ dark: false });
const COLOR_RANGES = getStatusColorRanges();

const DEFAULTS_BY_TYPE = {
  single: {
    columns: [],
    type: "single",
    operator: "=",
    value: "",
    color: COLORS[0],
    highlight_row: false,
  },
  range: {
    columns: [],
    type: "range",
    colors: COLOR_RANGES[0],
    min_type: null,
    max_type: null,
    min_value: 0,
    max_value: 100,
  },
};

// predicate for columns that can be formatted
export const isFormattable = field => isNumeric(field) || isString(field);

const INPUT_CLASSNAME = cx(CS.mt1, CS.full);

const getValueForDescription = rule =>
  ["is-null", "not-null"].includes(rule.operator) ? "" : ` ${rule.value}`;

export const ChartSettingsTableFormatting = props => {
  const [editingRule, setEditingRule] = useState();
  const [editingRuleIsNew, setEditingRuleIsNew] = useState();

  const { value, onChange, cols, canHighlightRow } = props;

  if (editingRule !== null && value[editingRule]) {
    return (
      <RuleEditor
        canHighlightRow={canHighlightRow}
        rule={value[editingRule]}
        cols={cols}
        isNew={editingRuleIsNew}
        onChange={rule => {
          onChange([
            ...value.slice(0, editingRule),
            rule,
            ...value.slice(editingRule + 1),
          ]);
        }}
        onRemove={() => {
          onChange([
            ...value.slice(0, editingRule),
            ...value.slice(editingRule + 1),
          ]);
          setEditingRule(null);
          setEditingRuleIsNew(null);
        }}
        onDone={() => {
          setEditingRule(null);
          setEditingRuleIsNew(null);
        }}
      />
    );
  } else {
    return (
      <RuleListing
        rules={value}
        cols={cols}
        onEdit={index => {
          setEditingRule(index);
          setEditingRuleIsNew(false);
        }}
        // This needs to be an async function so that onChange will complete (and value will be updated)
        // Before we set the state values for the next render
        onAdd={async () => {
          await onChange([
            {
              ...DEFAULTS_BY_TYPE["single"],
              // if there's a single column use that by default
              columns: cols.length === 1 ? [cols[0].name] : [],
              id: value.length,
            },
            ...value,
          ]);
          setEditingRuleIsNew(true);
          setEditingRule(0);
        }}
        onRemove={index => {
          onChange([...value.slice(0, index), ...value.slice(index + 1)]);
          MetabaseAnalytics.trackStructEvent(
            "Chart Settings",
            "Table Formatting",
            "Remove Rule",
          );
        }}
        onMove={(from, to) => {
          onChange(arrayMove(value, from, to));
          MetabaseAnalytics.trackStructEvent(
            "Chart Settings",
            "Table Formatting",
            "Move Rule",
          );
        }}
      />
    );
  }
};

const SortableRuleList = ({ rules, cols, onEdit, onRemove, onMove }) => {
  const rulesWithIDs = useMemo(
    () => rules.map((rule, index) => ({ ...rule, id: index.toString() })),
    [rules],
  );

  const getId = rule => rule.id.toString();

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const handleSortEnd = ({ id, newIndex }) => {
    const oldIndex = rulesWithIDs.findIndex(rule => getId(rule) === id);

    onMove(oldIndex, newIndex);
  };

  const handleRemove = id =>
    onRemove(rulesWithIDs.findIndex(rule => getId(rule) === id));

  const handleEdit = id =>
    onEdit(rulesWithIDs.findIndex(rule => getId(rule) === id));

  const renderItem = ({ item, id }) => (
    <Sortable id={id} draggingStyle={{ opacity: 0.5 }}>
      <RulePreview
        rule={item}
        cols={cols}
        onClick={() => handleEdit(id)}
        onRemove={() => handleRemove(id)}
      />
    </Sortable>
  );

  return (
    <div>
      <SortableList
        items={rulesWithIDs}
        getId={getId}
        renderItem={renderItem}
        sensors={[pointerSensor]}
        onSortEnd={handleSortEnd}
      />
    </div>
  );
};

const RuleListing = ({ rules, cols, onEdit, onAdd, onRemove, onMove }) => (
  <div>
    <h3>{t`Conditional formatting`}</h3>
    <div className={CS.mt2}>
      {t`You can add rules to make the cells in this table change color if
    they meet certain conditions.`}
    </div>
    <div className={CS.mt2}>
      <Button borderless icon="add" onClick={onAdd}>
        {t`Add a rule`}
      </Button>
    </div>
    {rules.length > 0 ? (
      <div className={CS.mt2}>
        <h3>{t`Rules will be applied in this order`}</h3>
        <div className={CS.mt2}>{t`Click and drag to reorder.`}</div>
        <SortableRuleList
          rules={rules}
          cols={cols}
          onEdit={onEdit}
          onRemove={onRemove}
          onMove={onMove}
          distance={10}
        />
      </div>
    ) : null}
  </div>
);

const RulePreview = ({ rule, cols, onClick, onRemove }) => (
  <div
    className={cx(
      CS.my2,
      CS.bordered,
      CS.rounded,
      CS.shadowed,
      CS.cursorPointer,
      CS.bgWhite,
    )}
    onClick={onClick}
    data-testid="formatting-rule-preview"
  >
    <div className={cx(CS.p1, CS.borderBottom, CS.relative, CS.bgLight)}>
      <div className={cx(CS.px1, CS.flex, CS.alignCenter, CS.relative)}>
        <span className={cx(CS.h4, CS.flexAuto, CS.textDark, CS.textWrap)}>
          {rule.columns.length > 0 ? (
            rule.columns
              .map(
                name =>
                  (_.findWhere(cols, { name }) || {}).display_name || name,
              )
              .join(", ")
          ) : (
            <span
              style={{ fontStyle: "oblique" }}
            >{t`No columns selected`}</span>
          )}
        </span>
        <Icon
          name="close"
          className={cx(CS.cursorPointer, CS.textLight, CS.textMediumHover)}
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
        />
      </div>
    </div>
    <div className={cx(CS.p2, CS.flex, CS.alignCenter)}>
      <RuleBackground
        rule={rule}
        className={cx(CS.mr2, CS.flexNoShrink, CS.rounded, {
          [CS.bordered]: rule.type === "range",
        })}
        style={{ width: 40, height: 40 }}
      />
      <RuleDescription rule={rule} />
    </div>
  </div>
);

const RuleBackground = ({ rule, className, style }) =>
  rule.type === "range" ? (
    <ColorRange colors={rule.colors} className={className} style={style} />
  ) : rule.type === "single" ? (
    <SinglePreview color={rule.color} className={className} style={style} />
  ) : null;

const SinglePreview = ({ color, className, style, ...props }) => (
  <div
    className={className}
    style={{ ...style, background: color }}
    {...props}
  />
);

const RuleDescription = ({ rule }) => {
  return (
    <span>
      {rule.type === "range"
        ? t`Cells in this column will be tinted based on their values.`
        : rule.type === "single"
        ? jt`When a cell in these columns ${(
            <span className={CS.textBold}>
              {ALL_OPERATOR_NAMES[rule.operator]}
              {getValueForDescription(rule)}
            </span>
          )} it will be tinted this color.`
        : null}
    </span>
  );
};

const RuleEditor = ({
  rule,
  cols,
  isNew,
  onChange,
  onDone,
  onRemove,
  canHighlightRow = true,
}) => {
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
    rule.operator !== "is-null" &&
    rule.operator !== "not-null" &&
    rule.operator !== "is-true" &&
    rule.operator !== "is-false";

  const handleColumnChange = columns => {
    const _cols = columns.map(name => _.findWhere(cols, { name }));
    const operatorUpdate =
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
        onChange={e => handleColumnChange(e.target.value)}
        isInitiallyOpen={rule.columns.length === 0}
        placeholder={t`Choose a column`}
        multiple
      >
        {cols.map(col => (
          <Option
            key={col.name}
            value={col.name}
            disabled={
              (isStringRule && (!isString(col) || isBoolean(col))) ||
              (isNumericRule && !isNumeric(col)) ||
              (isBooleanRule && !isBoolean(col))
            }
          >
            {col.display_name}
          </Option>
        ))}
      </Select>
      {isNumericRule && (
        <div>
          <h3 className={cx(CS.mt3, CS.mb1)}>{t`Formatting style`}</h3>
          <Radio
            value={rule.type}
            options={[
              { name: t`Single color`, value: "single" },
              { name: t`Color range`, value: "range" },
            ]}
            onChange={type =>
              onChange({ ...DEFAULTS_BY_TYPE[type], ...rule, type })
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
            value={rule.operator}
            onChange={e => onChange({ ...rule, operator: e.target.value })}
            buttonProps={{
              "data-testid": "conditional-formatting-value-operator-button",
            }}
          >
            {Object.entries({
              ...COMMON_OPERATOR_NAMES,
              ...(isBooleanRule
                ? BOOLEAN_OPERATIOR_NAMES
                : isNumericRule
                ? NUMBER_OPERATOR_NAMES
                : isStringRule
                ? STRING_OPERATOR_NAMES
                : {}),
            }).map(([operator, operatorName]) => (
              <Option key={operatorName} value={operator}>
                {operatorName}
              </Option>
            ))}
          </Select>
          {hasOperand && isNumericRule ? (
            <NumericInput
              data-testid="conditional-formatting-value-input"
              className={INPUT_CLASSNAME}
              type="number"
              value={rule.value}
              onChange={value => onChange({ ...rule, value })}
              placeholder="0"
            />
          ) : hasOperand ? (
            <Input
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
              MetabaseAnalytics.trackStructEvent(
                "Chart Settings",
                "Table Formatting",
                "Select Range  Colors",
                colors,
              );
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
              onChange={min_value => onChange({ ...rule, min_value })}
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
              onChange={max_value => onChange({ ...rule, max_value })}
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
