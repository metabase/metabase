import React from "react";

import { Flex } from "grid-styled";
import cx from "classnames";
import _ from "underscore";

import {
  NotebookCell,
  NotebookCellItem,
  NotebookCellAdd,
} from "../NotebookCell";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import FieldList from "metabase/query_builder/components/FieldList";
import Join from "metabase-lib/lib/queries/structured/Join";

export default function JoinStep({
  color,
  query,
  updateQuery,
  isLastOpened,
  ...props
}) {
  let joins = query.joins();
  if (joins.length === 0) {
    joins = [new Join({ fields: "all" }, 0, query)];
  }
  const valid = _.all(joins, join => join.isValid());
  return (
    <NotebookCell color={color} flexWrap="nowrap">
      <Flex flexDirection="column">
        {joins.map((join, index) => (
          <JoinClause
            mb={index === joins.length - 1 ? 0 : 2}
            key={index}
            color={color}
            join={join}
            showRemove={joins.length > 1}
            updateQuery={updateQuery}
            isLastOpened={isLastOpened && index === join.length - 1}
          />
        ))}
      </Flex>
      {valid && (
        <NotebookCellAdd
          color={color}
          className="cursor-pointer ml-auto"
          onClick={() => {
            query.addJoin(new Join({ fields: "all" })).update(updateQuery);
          }}
        />
      )}
    </NotebookCell>
  );
}

class JoinClause extends React.Component {
  render() {
    const {
      color,
      join,
      updateQuery,
      showRemove,
      isLastOpened,
      ...props
    } = this.props;
    const query = join.query();
    if (!query) {
      return null;
    }
    const parentTable = join.parentTable();
    const joinedTable = join.joinedTable();
    const strategyOption = join.strategyOption();
    return (
      <Flex align="center" flex="1 1 auto" {...props}>
        <NotebookCellItem color={color} icon="table2">
          {parentTable.displayName() || `Previous results`}
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
                join
                  .setStrategy(strategy)
                  .parent()
                  .update(updateQuery);
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
          selectedTableId={join.joinSourceTableId()}
          setSourceTableFn={tableId => {
            const newJoin = join.setJoinSourceTableId(tableId);
            newJoin.parent().update(updateQuery);
            // _parentDimensionPicker won't be rendered until next update
            if (!newJoin.parentDimension()) {
              setTimeout(() => {
                this._parentDimensionPicker.open();
              });
            }
          }}
          isInitiallyOpen={join.joinSourceTableId() == null}
          triggerElement={
            <NotebookCellItem
              color={color}
              icon="table2"
              inactive={!joinedTable}
            >
              {joinedTable ? joinedTable.displayName() : `Pick a table...`}
            </NotebookCellItem>
          }
        />

        {joinedTable && (
          <Flex align="center">
            <span className="text-medium text-bold ml1 mr2">where</span>

            <JoinDimensionPicker
              color={color}
              query={query}
              dimension={join.parentDimension()}
              options={join.parentDimensionOptions()}
              onChange={fieldRef => {
                join
                  .setParentDimension(fieldRef)
                  .parent()
                  .update(updateQuery);
                if (!join.joinDimension()) {
                  this._joinDimensionPicker.open();
                }
              }}
              ref={ref => (this._parentDimensionPicker = ref)}
            />

            <span className="text-medium text-bold mr1">=</span>

            <JoinDimensionPicker
              color={color}
              query={query}
              dimension={join.joinDimension()}
              options={join.joinDimensionOptions()}
              onChange={fieldRef => {
                join
                  .setJoinDimension(fieldRef)
                  .parent()
                  .update(updateQuery);
              }}
              ref={ref => (this._joinDimensionPicker = ref)}
            />
          </Flex>
        )}

        {showRemove && (
          <Icon
            name="close"
            size={18}
            className="cursor-pointer text-light text-medium-hover"
            onClick={() => join.remove().update(updateQuery)}
          />
        )}
      </Flex>
    );
  }
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
        name={icon}
        size={24}
      />
      {name}
    </Flex>
  );
}

class JoinDimensionPicker extends React.Component {
  open() {
    this._popover.open();
  }
  render() {
    const { dimension, onChange, options, query, color } = this.props;
    return (
      <PopoverWithTrigger
        ref={ref => (this._popover = ref)}
        triggerElement={
          <NotebookCellItem
            color={color}
            icon={dimension && dimension.icon()}
            inactive={!dimension}
          >
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
}
