import React from "react";

import { Flex } from "grid-styled";
import cx from "classnames";
import _ from "underscore";
import { t } from "ttag";

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
  step,
  updateQuery,
  isLastOpened,
  ...props
}) {
  const isSingleJoinStep = step.itemIndex != null;
  let joins = query.joins();
  if (isSingleJoinStep) {
    const join = joins[step.itemIndex];
    joins = join ? [join] : [];
  }
  if (joins.length === 0) {
    joins = [new Join({ fields: "all" }, query.joins().length, query)];
  }
  const valid = _.all(joins, join => join.isValid());
  return (
    <NotebookCell color={color} flexWrap="nowrap">
      <Flex flexDirection="column" className="flex-full">
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
      {!isSingleJoinStep && valid && (
        <NotebookCellAdd
          color={color}
          className="cursor-pointer ml-auto"
          onClick={() => {
            query.join(new Join({ fields: "all" })).update(updateQuery);
          }}
        />
      )}
    </NotebookCell>
  );
}

class JoinClause extends React.Component {
  render() {
    const { color, join, updateQuery, showRemove, ...props } = this.props;
    const query = join.query();
    if (!query) {
      return null;
    }

    let lhsTable;
    if (join.index() === 0) {
      // first join's lhs is always the parent table
      lhsTable = join.parentTable();
    } else if (join.parentDimension()) {
      // subsequent can be one of the previously joined tables
      // NOTE: `lhsDimension` would probably be a better name for `parentDimension`
      lhsTable = join.parentDimension().field().table;
    }

    const joinedTable = join.joinedTable();
    const strategyOption = join.strategyOption();
    return (
      <Flex align="center" flex="1 1 auto" {...props}>
        <NotebookCellItem color={color} icon="table2">
          {(lhsTable && lhsTable.displayName()) || `Previous results`}
        </NotebookCellItem>

        <PopoverWithTrigger
          triggerElement={
            strategyOption ? (
              <Icon
                tooltip={t`Change join type`}
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
            query.database().savedQuestionsDatabase(),
          ].filter(d => d)}
          tableFilter={table => table.db_id === query.database().id}
          selectedDatabaseId={query.databaseId()}
          selectedTableId={join.joinSourceTableId()}
          setSourceTableFn={tableId => {
            const newJoin = join
              .setJoinSourceTableId(tableId)
              .setDefaultCondition()
              .setDefaultAlias();
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
              {joinedTable ? joinedTable.displayName() : t`Pick a table...`}
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
                  .setDefaultAlias()
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

        {join.isValid() && (
          <JoinFieldsPicker
            className="mb1 ml-auto text-bold"
            join={join}
            updateQuery={updateQuery}
          />
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

import FieldsPicker from "./FieldsPicker";

const JoinFieldsPicker = ({ className, join, updateQuery }) => {
  const dimensions = join.joinedDimensions();
  const selectedDimensions = join.fieldsDimensions();
  const selected = new Set(selectedDimensions.map(d => d.key()));
  return (
    <FieldsPicker
      className={className}
      dimensions={dimensions}
      selectedDimensions={selectedDimensions}
      isAll={join.fields === "all"}
      isNone={join.fields === "none"}
      onSelectAll={() =>
        join
          .setFields("all")
          .parent()
          .update(updateQuery)
      }
      onSelectNone={() =>
        join
          .setFields("none")
          .parent()
          .update(updateQuery)
      }
      onToggleDimension={(dimension, enable) => {
        join
          .setFields(
            dimensions
              .filter(d => {
                if (d === dimension) {
                  return !selected.has(d.key());
                } else {
                  return selected.has(d.key());
                }
              })
              .map(d => d.mbql()),
          )
          .parent()
          .update(updateQuery);
      }}
    />
  );
};
