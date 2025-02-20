/* eslint-disable react/prop-types */
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";

import { RuleEditor } from "./RuleEditor";
import { SortableRuleList } from "./SortableRuleList";
import { DEFAULTS_BY_TYPE } from "./constants";

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
        }}
        onMove={(from, to) => {
          onChange(arrayMove(value, from, to));
        }}
      />
    );
  }
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

export const SinglePreview = ({ color, className, style, ...props }) => (
  <div
    className={className}
    style={{ ...style, background: color }}
    {...props}
  />
);
