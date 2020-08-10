import React from "react";

import { t, jt } from "ttag";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Select, { Option } from "metabase/components/Select";
import Radio from "metabase/components/Radio";
import Toggle from "metabase/components/Toggle";
import ColorPicker from "metabase/components/ColorPicker";

import ColorRangePicker, {
  ColorRangePreview,
} from "metabase/components/ColorRangePicker";
import NumericInput from "metabase/components/NumericInput";

import { SortableContainer, SortableElement } from "react-sortable-hoc";

import MetabaseAnalytics from "metabase/lib/analytics";
import { isNumeric, isString } from "metabase/lib/schema_metadata";

import _ from "underscore";
import cx from "classnames";

const NUMBER_OPERATOR_NAMES = {
  "<": t`is less than`,
  ">": t`is greater than`,
  "<=": t`is less than or equal to`,
  ">=": t`is greater than or equal to`,
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  "is-null": t`is null`,
  "not-null": t`is not null`,
};

const STRING_OPERATOR_NAMES = {
  "=": t`is equal to`,
  "!=": t`is not equal to`,
  "is-null": t`is null`,
  "not-null": t`is not null`,
  contains: t`contains`,
  "does-not-contain": t`does not contain`,
  "starts-with": t`starts with`,
  "ends-with": t`ends with`,
};

export const ALL_OPERATOR_NAMES = {
  ...NUMBER_OPERATOR_NAMES,
  ...STRING_OPERATOR_NAMES,
};

import { color, desaturated } from "metabase/lib/colors";

const COLORS = Object.values(desaturated);
const COLOR_RANGES = [].concat(
  ...COLORS.map(color => [["white", color], [color, "white"]]),
  [
    [color("error"), "white", color("success")],
    [color("success"), "white", color("error")],
    [color("error"), color("warning"), color("success")],
    [color("success"), color("warning"), color("error")],
  ],
);

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

const INPUT_CLASSNAME = "AdminSelect input mt1 full";

export default class ChartSettingsTableFormatting extends React.Component {
  state = {
    editingRule: null,
    editingRuleIsNew: null,
  };
  render() {
    const { value, onChange, cols } = this.props;
    const { editingRule, editingRuleIsNew } = this.state;
    if (editingRule !== null && value[editingRule]) {
      return (
        <RuleEditor
          rule={value[editingRule]}
          cols={cols}
          isNew={editingRuleIsNew}
          onChange={rule =>
            onChange([
              ...value.slice(0, editingRule),
              rule,
              ...value.slice(editingRule + 1),
            ])
          }
          onRemove={() => {
            onChange([
              ...value.slice(0, editingRule),
              ...value.slice(editingRule + 1),
            ]);
            this.setState({ editingRule: null, editingRuleIsNew: null });
          }}
          onDone={() => {
            this.setState({ editingRule: null, editingRuleIsNew: null });
          }}
        />
      );
    } else {
      return (
        <RuleListing
          rules={value}
          cols={cols}
          onEdit={index => {
            this.setState({ editingRule: index, editingRuleIsNew: false });
          }}
          onAdd={() => {
            onChange([
              {
                ...DEFAULTS_BY_TYPE["single"],
                // if there's a single column use that by default
                columns: cols.length === 1 ? [cols[0].name] : [],
              },
              ...value,
            ]);
            this.setState({ editingRule: 0, editingRuleIsNew: true });
          }}
          onRemove={index => {
            onChange([...value.slice(0, index), ...value.slice(index + 1)]);
            MetabaseAnalytics.trackEvent(
              "Chart Settings",
              "Table Formatting",
              "Remove Rule",
            );
          }}
          onMove={(from, to) => {
            const newValue = [...value];
            newValue.splice(to, 0, newValue.splice(from, 1)[0]);
            onChange(newValue);
            MetabaseAnalytics.trackEvent(
              "Chart Settings",
              "Table Formatting",
              "Move Rule",
            );
          }}
        />
      );
    }
  }
}

const SortableRuleItem = SortableElement(({ rule, cols, onEdit, onRemove }) => (
  <RulePreview rule={rule} cols={cols} onClick={onEdit} onRemove={onRemove} />
));

const SortableRuleList = SortableContainer(
  ({ rules, cols, onEdit, onRemove }) => {
    return (
      <div>
        {rules.map((rule, index) => (
          <SortableRuleItem
            key={`item-${index}`}
            index={index}
            rule={rule}
            cols={cols}
            onEdit={() => onEdit(index)}
            onRemove={() => onRemove(index)}
          />
        ))}
      </div>
    );
  },
);

const RuleListing = ({ rules, cols, onEdit, onAdd, onRemove, onMove }) => (
  <div>
    <h3>{t`Conditional formatting`}</h3>
    <div className="mt2">
      {t`You can add rules to make the cells in this table change color if
    they meet certain conditions.`}
    </div>
    <div className="mt2">
      <Button
        borderless
        icon="add"
        onClick={onAdd}
        data-metabase-event={`Chart Settings;Table Formatting;Add Rule`}
      >
        {t`Add a rule`}
      </Button>
    </div>
    {rules.length > 0 ? (
      <div className="mt2">
        <h3>{t`Rules will be applied in this order`}</h3>
        <div className="mt2">{t`Click and drag to reorder.`}</div>
        <SortableRuleList
          rules={rules}
          cols={cols}
          onEdit={onEdit}
          onRemove={onRemove}
          onSortEnd={({ oldIndex, newIndex }) => onMove(oldIndex, newIndex)}
          distance={10}
          helperClass="z5"
        />
      </div>
    ) : null}
  </div>
);

const RulePreview = ({ rule, cols, onClick, onRemove }) => (
  <div
    className="my2 bordered rounded shadowed cursor-pointer bg-white"
    onClick={onClick}
  >
    <div className="p1 border-bottom relative bg-light">
      <div className="px1 flex align-center relative">
        <span className="h4 flex-auto text-dark text-wrap">
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
          className="cursor-pointer text-light text-medium-hover"
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
        />
      </div>
    </div>
    <div className="p2 flex align-center">
      <RuleBackground
        rule={rule}
        className={cx("mr2 flex-no-shrink rounded", {
          bordered: rule.type === "range",
        })}
        style={{ width: 40, height: 40 }}
      />
      <RuleDescription rule={rule} />
    </div>
  </div>
);

const RuleBackground = ({ rule, className, style }) =>
  rule.type === "range" ? (
    <ColorRangePreview
      colors={rule.colors}
      className={className}
      style={style}
    />
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

const RuleDescription = ({ rule }) => (
  <span>
    {rule.type === "range"
      ? t`Cells in this column will be tinted based on their values.`
      : rule.type === "single"
      ? jt`When a cell in these columns ${(
          <span className="text-bold">
            {ALL_OPERATOR_NAMES[rule.operator]} {rule.value}
          </span>
        )} it will be tinted this color.`
      : null}
  </span>
);

const RuleEditor = ({ rule, cols, isNew, onChange, onDone, onRemove }) => {
  const selectedColumns = rule.columns.map(name => _.findWhere(cols, { name }));
  const isStringRule =
    selectedColumns.length > 0 && _.all(selectedColumns, isString);
  const isNumericRule =
    selectedColumns.length > 0 && _.all(selectedColumns, isNumeric);

  const hasOperand =
    rule.operator !== "is-null" && rule.operator !== "not-null";

  return (
    <div>
      <h3 className="mb1">{t`Which columns should be affected?`}</h3>
      <Select
        value={rule.columns}
        onChange={e => onChange({ ...rule, columns: e.target.value })}
        isInitiallyOpen={rule.columns.length === 0}
        placeholder="Choose a column"
        multiple
      >
        {cols.map(col => (
          <Option
            value={col.name}
            disabled={
              (isStringRule && !isString(col)) ||
              (isNumericRule && !isNumeric(col))
            }
          >
            {col.display_name}
          </Option>
        ))}
      </Select>
      {isNumericRule && (
        <div>
          <h3 className="mt3 mb1">{t`Formatting style`}</h3>
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
          <h3 className="mt3 mb1">{t`When a cell in this column…`}</h3>
          <Select
            value={rule.operator}
            onChange={e => onChange({ ...rule, operator: e.target.value })}
          >
            {Object.entries(
              isNumericRule ? NUMBER_OPERATOR_NAMES : STRING_OPERATOR_NAMES,
            ).map(([operator, operatorName]) => (
              <Option value={operator}>{operatorName}</Option>
            ))}
          </Select>
          {hasOperand && isNumericRule ? (
            <NumericInput
              className={INPUT_CLASSNAME}
              type="number"
              value={rule.value}
              onChange={value => onChange({ ...rule, value })}
            />
          ) : hasOperand ? (
            <input
              className={INPUT_CLASSNAME}
              value={rule.value}
              onChange={e => onChange({ ...rule, value: e.target.value })}
            />
          ) : null}
          <h3 className="mt3 mb1">{t`…turn its background this color:`}</h3>
          <ColorPicker
            value={rule.color}
            colors={COLORS}
            onChange={color => onChange({ ...rule, color })}
          />
          <h3 className="mt3 mb1">{t`Highlight the whole row`}</h3>
          <Toggle
            value={rule.highlight_row}
            onChange={highlight_row => onChange({ ...rule, highlight_row })}
          />
        </div>
      ) : rule.type === "range" ? (
        <div>
          <h3 className="mt3 mb1">{t`Colors`}</h3>
          <ColorRangePicker
            value={rule.colors}
            onChange={colors => {
              MetabaseAnalytics.trackEvent(
                "Chart Settings",
                "Table Formatting",
                "Select Range  Colors",
                colors,
              );
              onChange({ ...rule, colors });
            }}
            ranges={COLOR_RANGES}
          />
          <h3 className="mt3 mb1">{t`Start the range at`}</h3>
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
          <h3 className="mt3 mb1">{t`End the range at`}</h3>
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
      <div className="mt4">
        {rule.columns.length === 0 ? (
          <Button
            primary
            onClick={onRemove}
            data-metabase-event={`Chart Settings;Table Formatting;`}
          >
            {isNew ? t`Cancel` : t`Delete`}
          </Button>
        ) : (
          <Button
            primary
            onClick={onDone}
            data-metabase-event={`Chart Setttings;Table Formatting;${
              isNew ? "Add Rule" : "Update Rule"
            };Rule Type ${rule.type} Color`}
          >
            {isNew ? t`Add rule` : t`Update rule`}
          </Button>
        )}
      </div>
    </div>
  );
};
