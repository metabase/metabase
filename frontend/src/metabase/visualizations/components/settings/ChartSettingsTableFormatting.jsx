import React from "react";

import { t, jt } from "c-3po";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Select, { Option } from "metabase/components/Select";
import Radio from "metabase/components/Radio";
import Toggle from "metabase/components/Toggle";
import ColorPicker from "metabase/components/ColorPicker";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { formatNumber, capitalize } from "metabase/lib/formatting";
import { isNumeric } from "metabase/lib/schema_metadata";

import _ from "underscore";
import d3 from "d3";
import cx from "classnames";

const OPERATOR_NAMES = {
  "<": t`less than`,
  ">": t`greater than`,
  "<=": t`less than or equal to`,
  ">=": t`greater than or equal to`,
  "=": t`equal to`,
  "!=": t`not equal to`,
};

import { desaturated } from "metabase/lib/colors";

const COLORS = Object.values(desaturated);
const COLOR_RANGES = COLORS.map(color => ["white", color]);

const DEFAULTS_BY_TYPE = {
  single: {
    columns: [],
    type: "single",
    operator: ">",
    value: 0,
    color: COLORS[0],
    highlight_row: false,
  },
  range: {
    columns: [],
    type: "range",
    colors: COLOR_RANGES[0],
    min_type: "min",
    max_type: "max",
    min_value: 0,
    max_value: 100,
  },
};

export default class ChartSettingsTableFormatting extends React.Component {
  state = {
    editingRule: null,
  };
  render() {
    const { value, onChange, cols } = this.props;
    const { editingRule } = this.state;
    if (editingRule !== null && value[editingRule]) {
      return (
        <RuleEditor
          rule={value[editingRule]}
          onChange={rule =>
            onChange([
              ...value.slice(0, editingRule),
              rule,
              ...value.slice(editingRule + 1),
            ])
          }
          cols={cols}
          onBack={() => this.setState({ editingRule: null })}
        />
      );
    } else {
      return (
        <RuleListing
          rules={value}
          cols={cols}
          onEdit={index => this.setState({ editingRule: index })}
          onAdd={() => {
            onChange(value.concat({ ...DEFAULTS_BY_TYPE["single"] }));
            this.setState({ editingRule: value.length });
          }}
          onRemove={index =>
            onChange([...value.slice(0, index), ...value.slice(index + 1)])
          }
        />
      );
    }
  }
}

const RuleListing = ({ rules, cols, onEdit, onAdd, onRemove }) => (
  <div>
    <h3>{t`Conditional formatting`}</h3>
    <div className="mt2">
      {t`You can add rules to make the cells in this table change color if
    they meet certain conditions.`}
    </div>
    <div className="mt2">
      <Button borderless icon="add" onClick={onAdd}>
        {t`Add a rule`}
      </Button>
    </div>
    {rules.length > 0 ? (
      <div className="mt2">
        <h3>{t`Rules will be applied in this order`}</h3>
        <div>
          {rules.map((rule, index) => (
            <RulePreview
              rule={rule}
              cols={cols}
              onClick={() => onEdit(index)}
              onRemove={() => onRemove(index)}
            />
          ))}
        </div>
      </div>
    ) : null}
  </div>
);

const RulePreview = ({ rule, cols, onClick, onRemove }) => (
  <div className="bordered rounded shadowed my2">
    <div className="border-bottom relative p1">
      <RuleBackground rule={rule} className="absolute spread" />
      <div
        className="flex align-center relative cursor-pointer p1"
        onClick={onClick}
      >
        <span className="h4 flex-full text-dark">
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
          className="cursor-pointer text-grey-2 text-grey-4-hover"
          onClick={onRemove}
        />
      </div>
    </div>
    <div className="p2">
      <RuleDescription rule={rule} />
    </div>
  </div>
);

const RuleBackground = ({ rule, className }) =>
  rule.type === "range" ? (
    <RangePreview colors={rule.colors} className={className} />
  ) : rule.type === "single" ? (
    <div className={className} style={{ background: rule.color }} />
  ) : null;

const RangePreview = ({ colors, className, ...props }) => (
  <div className={cx(className, "flex")} {...props}>
    {d3.range(0, 1.25, 0.25).map(value => (
      <div
        className="flex-full"
        style={{
          background: d3.scale
            .linear()
            .domain([0, 1])
            .range(colors || [])(value),
        }}
      />
    ))}
  </div>
);

const RuleDescription = ({ rule }) => (
  <span>
    {rule.type === "range"
      ? t`Cells in this column will be tinted based on their values.`
      : rule.type === "single"
        ? jt`When a cell in these columns is ${(
            <span className="text-bold">
              {OPERATOR_NAMES[rule.operator]} {formatNumber(rule.value)}
            </span>
          )} it will be tinted this color.`
        : null}
  </span>
);

const RuleEditor = ({ rule, onChange, cols, onBack }) => (
  <div>
    <h3 className="mb1">{t`Which columns should be affected?`}</h3>
    <Select
      value={rule.columns[0]}
      onChange={e => onChange({ ...rule, columns: [e.target.value] })}
      multiple
    >
      {cols
        .filter(col => isNumeric(col))
        .map(col => <Option value={col.name}>{col.display_name}</Option>)}
    </Select>
    <h3 className="mt3 mb1">{t`Formatting style`}</h3>
    <Radio
      value={rule.type}
      options={[
        { name: t`Single color`, value: "single" },
        { name: t`Color range`, value: "range" },
      ]}
      onChange={type => onChange({ ...DEFAULTS_BY_TYPE[type], ...rule, type })}
      isVertical
    />
    {rule.type === "single" ? (
      <div>
        <h3 className="mt3 mb1">{t`When a cell in this column is…`}</h3>
        <Select
          value={rule.operator}
          onChange={e => onChange({ ...rule, operator: e.target.value })}
        >
          {Object.entries(OPERATOR_NAMES).map(([operator, operatorName]) => (
            <Option value={operator}>{capitalize(operatorName)}</Option>
          ))}
        </Select>
        <NumericInput
          value={rule.value}
          onChange={value => onChange({ ...rule, value })}
        />
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
          colors={rule.colors}
          onChange={colors => onChange({ ...rule, colors })}
        />
        <h3 className="mt3 mb1">{t`Start the range at`}</h3>
        <Radio
          value={rule.min_type}
          onChange={min_type => onChange({ ...rule, min_type })}
          options={[
            { name: t`Smallet value in the table`, value: "min" },
            { name: t`Custom value`, value: "custom" },
          ]}
          isVertical
        />
        {rule.min_type === "custom" && (
          <NumericInput
            value={rule.min_value}
            onChange={min_value => onChange({ ...rule, min_value })}
          />
        )}
        <h3 className="mt3 mb1">{t`End the range at`}</h3>
        <Radio
          value={rule.max_type}
          onChange={max_type => onChange({ ...rule, max_type })}
          options={[
            { name: t`Largest value in the table`, value: "max" },
            { name: t`Custom value`, value: "custom" },
          ]}
          isVertical
        />
        {rule.max_type === "custom" && (
          <NumericInput
            value={rule.max_value}
            onChange={max_value => onChange({ ...rule, max_value })}
          />
        )}
      </div>
    ) : null}
    <div className="mt3">
      <Button onClick={onBack}>Back</Button>
    </div>
  </div>
);

const ColorRangePicker = ({ colors, onChange, className, style }) => (
  <PopoverWithTrigger
    triggerElement={
      <RangePreview
        colors={colors}
        className={cx(className, "bordered rounded")}
        style={{ height: 30, ...style }}
      />
    }
  >
    <div className="pt1 px1">
      {COLOR_RANGES.map(range => (
        <div className="mb1">
          <RangePreview
            colors={range}
            onClick={() => onChange(range)}
            className={cx("bordered rounded")}
            style={{ height: 30, width: 200 }}
          />
        </div>
      ))}
    </div>
  </PopoverWithTrigger>
);

const NumericInput = ({ value, onChange }) => (
  <input
    className="AdminSelect input mt1 full"
    type="number"
    value={value}
    onChange={e => onChange(e.target.value)}
  />
);
