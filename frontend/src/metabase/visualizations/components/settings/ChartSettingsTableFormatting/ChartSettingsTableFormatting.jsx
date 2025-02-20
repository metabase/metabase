/* eslint-disable react/prop-types */
import { PointerSensor, useSensor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import cx from "classnames";
import { useMemo, useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import ColorRange from "metabase/core/components/ColorRange";
import { Sortable, SortableList } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import { RuleEditor } from "./RuleEditor";
import { ALL_OPERATOR_NAMES, DEFAULTS_BY_TYPE } from "./constants";
import { getValueForDescription } from "./util";

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
          style={{ minWidth: 16 }}
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
              <span key="bold" className={CS.textBold}>
                {ALL_OPERATOR_NAMES[rule.operator]}
                {getValueForDescription(rule)}
              </span>
            )} it will be tinted this color.`
          : null}
    </span>
  );
};
