import React from "react";

import { Flex } from "grid-styled";
import cx from "classnames";

import NotebookCell, { NotebookCellItem } from "../NotebookCell";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import FieldList from "metabase/query_builder/components/FieldList";
import Join from "metabase-lib/lib/queries/structured/Join";

const DEFAULT_STRATEGY = "left-join";

const JOIN_TYPES = [
  { value: "left-join", name: "Left outer join", icon: "join_left_outer" },
  { value: "right-join", name: "Right outer join", icon: "join_left_outer" },
  { value: "inner-join", name: "Inner join", icon: "join_left_outer" },
  { value: "outer-join", name: "Full outer join", icon: "join_left_outer" },
];

export default function JoinStep({ color, query, isLastOpened, ...props }) {
  const joins = query.joins();
  return (
    <NotebookCell color={color}>
      {joins.map((join, index) => (
        <JoinClause key={index} color={color} join={join} />
      ))}
      {joins.length === 0 && (
        <JoinClause color={color} join={new Join({}, 0, query)} />
      )}
    </NotebookCell>
  );
}

function JoinClause({ join, color }) {
  const query = join.query();
  if (!query) {
    return null;
  }
  const hasSource = join.table();
  return (
    <Flex align="center">
      <NotebookCellItem color={color}>
        <Icon className="mr1" name="table2" size={12} />
        {query.table().displayName()}
      </NotebookCellItem>

      <PopoverWithTrigger
        triggerElement={
          <Icon className="text-brand mr1" name="join_left_outer" size={32} />
        }
      >
        {({ onClose }) => (
          <JoinTypeSelect
            value={join.strategy || DEFAULT_STRATEGY}
            onChange={strategy => {
              join.setStrategy(strategy).update();
              onClose();
            }}
          />
        )}
      </PopoverWithTrigger>

      <DatabaseSchemaAndTableDataSelector
        databases={[
          query.database(),
          ...query
            .metadata()
            .databasesList()
            .filter(db => db.is_saved_questions),
        ]}
        selectedDatabaseId={query.databaseId()}
        selectedTableId={join.tableId()}
        setSourceTableFn={tableId => {
          join.setJoinTableId(tableId).update();
        }}
        isInitiallyOpen={join.tableId() == null}
        triggerElement={
          <NotebookCellItem color={color}>
            <Icon className="mr1" name="table2" size={12} />
            {join.table() ? join.table().displayName() : `Pick a Table...`}
          </NotebookCellItem>
        }
      />

      {hasSource && (
        <Flex align="center">
          <span className="text-medium text-bold ml1 mr2">where</span>

          <JoinDimensionPicker
            color={color}
            table={query.table()}
            dimension={join.sourceDimension()}
            options={join.sourceDimensionOptions()}
            onChange={fieldRef => join.setSourceDimension(fieldRef).update()}
          />

          <span className="text-medium text-bold mr1">=</span>

          <JoinDimensionPicker
            color={color}
            table={join.table()}
            dimension={join.joinDimension()}
            options={join.joinDimensionOptions()}
            onChange={fieldRef => join.setJoinDimension(fieldRef).update()}
          />
        </Flex>
      )}
    </Flex>
  );
}

function JoinTypeSelect({ value, onChange }) {
  return (
    <div className="px1 pt1">
      {JOIN_TYPES.map(joinType => (
        <JoinTypeOption
          {...joinType}
          selected={value === joinType.value}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function JoinTypeOption({ name, value, icon, selected, onChange }) {
  return (
    <Flex
      align="center"
      className={cx(
        "p1 mb1 rounded cursor-pointer text-white-hover bg-brand-hover",
        {
          "bg-brand text-white": selected,
        },
      )}
      onClick={() => onChange(value)}
    >
      <Icon
        className={cx("mr1", { "text-brand": !selected })}
        name="join_left_outer"
        size={24}
      />
      {name}
    </Flex>
  );
}

function JoinDimensionPicker({ dimension, onChange, options, table, color }) {
  return (
    <PopoverWithTrigger
      triggerElement={
        <NotebookCellItem color={color}>
          {dimension && (
            <Icon className="mr1" name={dimension.icon()} size={12} />
          )}
          {dimension ? dimension.displayName() : `Pick a column...`}
        </NotebookCellItem>
      }
    >
      {({ onClose }) => (
        <FieldList
          className="text-brand"
          field={dimension && dimension.mbql()}
          fieldOptions={options}
          table={table}
          onFieldChange={field => {
            onChange(field);
            onClose();
          }}
        />
      )}
    </PopoverWithTrigger>
  );
}
