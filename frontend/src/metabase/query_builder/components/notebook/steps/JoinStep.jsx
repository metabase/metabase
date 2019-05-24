import React from "react";

import { Flex } from "grid-styled";
import cx from "classnames";

import NotebookCell, { NotebookCellItem } from "../NotebookCell";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import FieldList from "metabase/query_builder/components/FieldList";
import Join from "metabase-lib/lib/queries/structured/Join";

export default function JoinStep({ color, query, isLastOpened, ...props }) {
  const joins = query.joins();
  return (
    <NotebookCell color={color}>
      {joins.map((join, index) => (
        <JoinClause key={index} color={color} join={join} />
      ))}
      {joins.length === 0 && (
        <JoinClause
          color={color}
          join={new Join({ fields: "all" }, 0, query)}
        />
      )}
    </NotebookCell>
  );
}

function JoinClause({ join, color }) {
  const query = join.query();
  if (!query) {
    return null;
  }
  const table = join.table();
  const strategyOption = join.strategyOption();
  return (
    <Flex align="center">
      <NotebookCellItem color={color} icon="table2">
        {query.table().displayName() || `Previous results`}
      </NotebookCellItem>

      <PopoverWithTrigger
        triggerElement={
          strategyOption ? (
            <Icon
              className="text-brand mr1"
              name={strategyOption.icon}
              size={32}
            />
          ) : (
            <NotebookCellItem color={color}>
              {`Choose a join type`}
            </NotebookCellItem>
          )
        }
      >
        {({ onClose }) => (
          <JoinTypeSelect
            value={strategyOption && strategyOption.value}
            onChange={strategy => {
              join.setStrategy(strategy).update();
              onClose();
            }}
            options={join.strategyOptions()}
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
          <NotebookCellItem color={color} icon="table2">
            {join.table() ? join.table().displayName() : `Pick a Table...`}
          </NotebookCellItem>
        }
      />

      {table && (
        <Flex align="center">
          <span className="text-medium text-bold ml1 mr2">where</span>

          <JoinDimensionPicker
            color={color}
            query={query}
            dimension={join.sourceDimension()}
            options={join.sourceDimensionOptions()}
            onChange={fieldRef => join.setSourceDimension(fieldRef).update()}
          />

          <span className="text-medium text-bold mr1">=</span>

          <JoinDimensionPicker
            color={color}
            query={query}
            dimension={join.joinDimension()}
            options={join.joinDimensionOptions()}
            onChange={fieldRef => join.setJoinDimension(fieldRef).update()}
          />
        </Flex>
      )}
    </Flex>
  );
}

function JoinTypeSelect({ value, onChange, options }) {
  return (
    <div className="px1 pt1">
      {options.map(option => (
        <JoinTypeOption
          {...option}
          selected={value === option.value}
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

function JoinDimensionPicker({ dimension, onChange, options, query, color }) {
  return (
    <PopoverWithTrigger
      triggerElement={
        <NotebookCellItem color={color} icon={dimension && dimension.icon()}>
          {dimension ? dimension.displayName() : `Pick a column...`}
        </NotebookCellItem>
      }
    >
      {({ onClose }) => (
        <FieldList
          className="text-brand"
          field={dimension && dimension.mbql()}
          fieldOptions={options}
          table={query.table()}
          query={query}
          onFieldChange={field => {
            onChange(field);
            onClose();
          }}
        />
      )}
    </PopoverWithTrigger>
  );
}
