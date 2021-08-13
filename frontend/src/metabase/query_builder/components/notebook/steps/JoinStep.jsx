import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import FieldList from "metabase/query_builder/components/FieldList";
import Join from "metabase-lib/lib/queries/structured/Join";

import {
  NotebookCell,
  NotebookCellItem,
  NotebookCellAdd,
} from "../NotebookCell";
import FieldsPicker from "./FieldsPicker";
import {
  JoinClausesContainer,
  JoinClauseContainer,
  JoinClauseRoot,
  JoinStrategyIcon,
  JoinTypeSelectRoot,
  JoinTypeOptionRoot,
  JoinTypeIcon,
  JoinedTableControlRoot,
  JoinWhereConditionLabel,
  JoinOnConditionLabel,
  RemoveJoinIcon,
} from "./JoinStep.styled";

const stepShape = {
  id: PropTypes.string,
  type: PropTypes.string,
  query: PropTypes.object,
  previewQuery: PropTypes.object,
  valid: PropTypes.bool,
  visible: PropTypes.bool,
  stageIndex: PropTypes.number,
  itemIndex: PropTypes.number,
  update: PropTypes.func,
  revert: PropTypes.func,
  clean: PropTypes.func,

  previous: stepShape,
  next: stepShape,
};

const joinStepPropTypes = {
  query: PropTypes.object.isRequired,
  step: PropTypes.shape(stepShape).isRequired,
  color: PropTypes.string,
  isLastOpened: PropTypes.bool,
  updateQuery: PropTypes.func.isRequired,
};

export default function JoinStep({
  color,
  query,
  step,
  updateQuery,
  isLastOpened,
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
      <JoinClausesContainer>
        {joins.map((join, index) => {
          const isLast = index === joins.length - 1;
          return (
            <JoinClauseContainer key={index} isLast={isLast}>
              <JoinClause
                join={join}
                color={color}
                showRemove={joins.length > 1}
                updateQuery={updateQuery}
                isLastOpened={isLastOpened && isLast}
              />
            </JoinClauseContainer>
          );
        })}
      </JoinClausesContainer>
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

JoinStep.propTypes = joinStepPropTypes;

const joinClausePropTypes = {
  color: PropTypes.string,
  join: PropTypes.object,
  updateQuery: PropTypes.func,
  showRemove: PropTypes.bool,
};

class JoinClause extends React.Component {
  render() {
    const { color, join, updateQuery, showRemove } = this.props;
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
    return (
      <JoinClauseRoot>
        <NotebookCellItem color={color} icon="table2">
          {(lhsTable && lhsTable.displayName()) || `Previous results`}
        </NotebookCellItem>

        <JoinTypePicker join={join} color={color} updateQuery={updateQuery} />

        <JoinTablePicker
          join={join}
          query={query}
          joinedTable={joinedTable}
          color={color}
          updateQuery={updateQuery}
        />

        {joinedTable && (
          <JoinedTableControlRoot>
            <JoinWhereConditionLabel />

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

            <JoinOnConditionLabel />

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
          </JoinedTableControlRoot>
        )}

        {join.isValid() && (
          <JoinFieldsPicker
            className="mb1 ml-auto text-bold"
            join={join}
            updateQuery={updateQuery}
          />
        )}

        {showRemove && (
          <RemoveJoinIcon onClick={() => join.remove().update(updateQuery)} />
        )}
      </JoinClauseRoot>
    );
  }
}

JoinClause.propTypes = joinClausePropTypes;

const joinTablePickerPropTypes = {
  join: PropTypes.object,
  query: PropTypes.object,
  joinedTable: PropTypes.object,
  color: PropTypes.string,
  updateQuery: PropTypes.func,
};

function JoinTablePicker({ join, query, joinedTable, color, updateQuery }) {
  return (
    <NotebookCellItem color={color} icon="table2" inactive={!joinedTable}>
      <DatabaseSchemaAndTableDataSelector
        hasTableSearch
        canChangeDatabase={false}
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
          joinedTable ? joinedTable.displayName() : t`Pick a table...`
        }
      />
    </NotebookCellItem>
  );
}

JoinTablePicker.propTypes = joinTablePickerPropTypes;

const joinTypePickerPropTypes = {
  join: PropTypes.object,
  color: PropTypes.string,
  updateQuery: PropTypes.func,
};

function JoinTypePicker({ join, color, updateQuery }) {
  const strategyOption = join.strategyOption();
  return (
    <PopoverWithTrigger
      triggerElement={
        strategyOption ? (
          <JoinStrategyIcon
            tooltip={t`Change join type`}
            name={strategyOption.icon}
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
  );
}

JoinTypePicker.propTypes = joinTypePickerPropTypes;

const joinStrategyOptionShape = {
  name: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
};

const joinTypeSelectPropTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape(joinStrategyOptionShape))
    .isRequired,
};

function JoinTypeSelect({ value, onChange, options }) {
  return (
    <JoinTypeSelectRoot>
      {options.map(option => (
        <JoinTypeOption
          {...option}
          key={option.value}
          selected={value === option.value}
          onChange={onChange}
        />
      ))}
    </JoinTypeSelectRoot>
  );
}

JoinTypeSelect.propTypes = joinTypeSelectPropTypes;

const joinTypeOptionPropTypes = {
  ...joinStrategyOptionShape,
  selected: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

function JoinTypeOption({ name, value, icon, selected, onChange }) {
  return (
    <JoinTypeOptionRoot isSelected={selected} onClick={() => onChange(value)}>
      <JoinTypeIcon name={icon} isSelected={selected} />
      {name}
    </JoinTypeOptionRoot>
  );
}

JoinTypeOption.propTypes = joinTypeOptionPropTypes;

const joinDimensionPickerPropTypes = {
  dimension: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.shape({
    count: PropTypes.number.isRequired,
    fks: PropTypes.array.isRequired,
    dimensions: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  query: PropTypes.object.isRequired,
  color: PropTypes.string,
};

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

JoinDimensionPicker.propTypes = joinDimensionPickerPropTypes;

const joinFieldsPickerPropTypes = {
  join: PropTypes.object.isRequired,
  updateQuery: PropTypes.func.isRequired,
  className: PropTypes.string,
};

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

JoinFieldsPicker.propTypes = joinFieldsPickerPropTypes;
