import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";

import type {
  ColumnFormattingSetting,
  DatasetColumn,
} from "metabase-types/api";

import { RuleEditor } from "./RuleEditor";
import { RuleListing } from "./RuleListing";
import { DEFAULTS_BY_TYPE } from "./constants";

export interface ChartSettingsTableFormattingProps {
  value: ColumnFormattingSetting[];
  onChange: (rules: ColumnFormattingSetting[]) => void;
  cols: DatasetColumn[];
  canHighlightRow?: boolean;
}

export const ChartSettingsTableFormatting = ({
  value,
  onChange,
  cols,
  canHighlightRow,
}: ChartSettingsTableFormattingProps) => {
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [editingRuleIsNew, setEditingRuleIsNew] = useState<boolean | null>(
    null,
  );

  if (editingRule !== null && value[editingRule]) {
    return (
      <RuleEditor
        canHighlightRow={canHighlightRow}
        rule={value[editingRule]}
        cols={cols}
        isNew={!!editingRuleIsNew}
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
