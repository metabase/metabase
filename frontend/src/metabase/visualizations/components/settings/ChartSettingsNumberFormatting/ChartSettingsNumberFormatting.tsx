import { useState } from "react";

import { DEFAULTS_BY_TYPE } from "./constants";
import { RuleEditor } from "./RuleEditor";
import { RuleListing } from "./RuleListing";
import type { NumberFormattingSetting } from "./types";

export interface ChartSettingsNumberFormattingProps {
  value: NumberFormattingSetting[];
  onChange: (rules: NumberFormattingSetting[]) => void;
}

export const ChartSettingsNumberFormatting = ({
  value,
  onChange,
}: ChartSettingsNumberFormattingProps) => {
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [editingRuleIsNew, setEditingRuleIsNew] = useState<boolean | null>(
    null,
  );

  if (editingRule !== null && value[editingRule]) {
    return (
      <RuleEditor
        rule={value[editingRule]}
        isNew={!!editingRuleIsNew}
        onChange={(rule) => {
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
        onEdit={(index) => {
          setEditingRule(index);
          setEditingRuleIsNew(false);
        }}
        onAdd={async () => {
          await onChange([
            {
              ...DEFAULTS_BY_TYPE["single"],
            },
            ...value,
          ]);
          setEditingRuleIsNew(true);
          setEditingRule(0);
        }}
        onRemove={(index) => {
          onChange([...value.slice(0, index), ...value.slice(index + 1)]);
        }}
      />
    );
  }
};
