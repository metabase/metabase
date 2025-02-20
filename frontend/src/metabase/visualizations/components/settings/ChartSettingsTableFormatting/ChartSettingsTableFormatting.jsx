/* eslint-disable react/prop-types */
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";

import { RuleEditor } from "./RuleEditor";
import { RuleListing } from "./RuleListing";
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

export const SinglePreview = ({ color, className, style, ...props }) => (
  <div
    className={className}
    style={{ ...style, background: color }}
    {...props}
  />
);
