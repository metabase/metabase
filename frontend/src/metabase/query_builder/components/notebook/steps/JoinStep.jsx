import React, { useRef } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import FieldList from "metabase/query_builder/components/FieldList";
import Join from "metabase-lib/lib/queries/structured/Join";
import { isDateTimeField } from "metabase/lib/query/field_ref";

import { NotebookCellItem, NotebookCellAdd } from "../NotebookCell";
import {
  FieldsPickerIcon,
  FieldPickerContentContainer,
  FIELDS_PICKER_STYLES,
} from "../FieldsPickerIcon";
import FieldsPicker from "./FieldsPicker";
import {
  DimensionContainer,
  DimensionSourceName,
  JoinStepRoot,
  JoinClausesContainer,
  JoinClauseRoot,
  JoinClauseContainer,
  JoinStrategyIcon,
  JoinTypeSelectRoot,
  JoinTypeOptionRoot,
  JoinTypeIcon,
  JoinDimensionControlsContainer,
  JoinWhereConditionLabelContainer,
  JoinWhereConditionLabel,
  JoinConditionLabel,
  RemoveDimensionIcon,
  RemoveJoinIcon,
  Row,
  PrimaryJoinCell,
  SecondaryJoinCell,
} from "./JoinStep.styled";

const stepShape = {
  id: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  query: PropTypes.object.isRequired,
  previewQuery: PropTypes.object,
  valid: PropTypes.bool.isRequired,
  visible: PropTypes.bool.isRequired,
  stageIndex: PropTypes.number.isRequired,
  itemIndex: PropTypes.number.isRequired,
  update: PropTypes.func.isRequired,
  revert: PropTypes.func.isRequired,
  clean: PropTypes.func.isRequired,
  actions: PropTypes.array.isRequired,

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

  function addNewJoinClause() {
    query.join(new Join({ fields: "all" })).update(updateQuery);
  }

  return (
    <JoinStepRoot>
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
          onClick={addNewJoinClause}
        />
      )}
    </JoinStepRoot>
  );
}

JoinStep.propTypes = joinStepPropTypes;

const joinClausePropTypes = {
  color: PropTypes.string,
  join: PropTypes.object,
  updateQuery: PropTypes.func,
  showRemove: PropTypes.bool,
};

function JoinClause({ color, join, updateQuery, showRemove }) {
  const joinDimensionPickersRef = useRef([]);
  const parentDimensionPickersRef = useRef([]);

  const query = join.query();
  if (!query) {
    return null;
  }

  const parentDimensions = join.parentDimensions();
  const parentDimensionOptions = join.parentDimensionOptions();
  const joinDimensions = join.joinDimensions();
  const joinDimensionOptions = join.joinDimensionOptions();

  const joinedTable = join.joinedTable();

  const joinConditions = join.getConditions();
  const displayConditions = joinConditions.length > 0 ? joinConditions : [[]];

  const hasAtLeastOneDimensionSelected = join.getDimensions().length > 0;

  let lhsTable;
  if (join.index() === 0) {
    // first join's lhs is always the parent table
    lhsTable = join.parentTable();
  } else if (join.parentDimensions().length > 0) {
    // subsequent can be one of the previously joined tables
    // NOTE: `lhsDimension` would probably be a better name for `parentDimension`
    lhsTable = join.parentDimensions()[0]?.field().table;
  }

  function onSourceTableSet(newJoin) {
    if (!newJoin.parentDimensions().length) {
      setTimeout(() => {
        parentDimensionPickersRef.current[0]?.open();
      });
    }
  }

  function onParentDimensionChange(index, fieldRef, { overwrite } = {}) {
    join
      .setParentDimension({
        index,
        dimension: fieldRef,
        overwriteTemporalUnit: overwrite,
      })
      .setDefaultAlias()
      .parent()
      .update(updateQuery);
    if (!join.joinDimensions()[index]) {
      joinDimensionPickersRef.current[index]?.open();
    }
  }

  function onJoinDimensionChange(index, fieldRef, { overwrite } = {}) {
    join
      .setJoinDimension({
        index,
        dimension: fieldRef,
        overwriteTemporalUnit: overwrite,
      })
      .parent()
      .update(updateQuery);
  }

  function addNewDimensionsPair(index) {
    join
      .addEmptyDimensionsPair()
      .parent()
      .update(updateQuery);

    // Need to wait, so a new dimensions pair renders
    // and a corresponding ref is created, so we can reference it here
    setTimeout(() => {
      parentDimensionPickersRef.current[index]?.open();
    });
  }

  function removeJoin() {
    join.remove().update(updateQuery);
  }

  return (
    <JoinClauseRoot>
      <PrimaryJoinCell color={color}>
        <NotebookCellItem color={color}>
          {lhsTable?.displayName() || t`Previous results`}
        </NotebookCellItem>

        <JoinTypePicker join={join} color={color} updateQuery={updateQuery} />

        <JoinTablePicker
          join={join}
          query={query}
          joinedTable={joinedTable}
          color={color}
          updateQuery={updateQuery}
          onSourceTableSet={onSourceTableSet}
        />
      </PrimaryJoinCell>

      {joinedTable && (
        <React.Fragment>
          <JoinWhereConditionLabelContainer>
            <JoinWhereConditionLabel />
          </JoinWhereConditionLabelContainer>
          <SecondaryJoinCell
            color={color}
            padding={hasAtLeastOneDimensionSelected && "8px"}
          >
            {displayConditions.map((condition, index) => {
              const isFirst = index === 0;
              const isLast = index === displayConditions.length - 1;

              function removeParentDimension() {
                join
                  .setParentDimension({ index, dimension: null })
                  .parent()
                  .update(updateQuery);
              }

              function removeJoinDimension() {
                join
                  .setJoinDimension({ index, dimension: null })
                  .parent()
                  .update(updateQuery);
              }

              function removeDimensionPair() {
                join
                  .removeCondition(index)
                  .parent()
                  .update(updateQuery);
              }

              return (
                <JoinDimensionControlsContainer
                  key={index}
                  isFirst={isFirst}
                  data-testid={`join-dimensions-pair-${index}`}
                >
                  <Row>
                    <JoinDimensionPicker
                      color={color}
                      query={query}
                      dimension={parentDimensions[index]}
                      options={parentDimensionOptions}
                      onChange={(fieldRef, opts) =>
                        onParentDimensionChange(index, fieldRef, opts)
                      }
                      onRemove={removeParentDimension}
                      ref={ref =>
                        (parentDimensionPickersRef.current[index] = ref)
                      }
                      data-testid="parent-dimension"
                    />
                    <JoinConditionLabel>=</JoinConditionLabel>
                  </Row>
                  <Row>
                    <JoinDimensionPicker
                      color={color}
                      query={query}
                      dimension={joinDimensions[index]}
                      options={joinDimensionOptions}
                      onChange={(fieldRef, opts) =>
                        onJoinDimensionChange(index, fieldRef, opts)
                      }
                      onRemove={removeJoinDimension}
                      ref={ref =>
                        (joinDimensionPickersRef.current[index] = ref)
                      }
                      data-testid="join-dimension"
                    />
                    {isLast ? (
                      <JoinDimensionsRightControl
                        isValidJoin={join.isValid()}
                        color={color}
                        isFirst={isFirst}
                        onAddNewDimensionPair={() =>
                          addNewDimensionsPair(index + 1)
                        }
                        onRemoveDimensionPair={removeDimensionPair}
                      />
                    ) : (
                      <JoinConditionLabel>{t`and`}</JoinConditionLabel>
                    )}
                  </Row>
                </JoinDimensionControlsContainer>
              );
            })}
          </SecondaryJoinCell>
        </React.Fragment>
      )}

      {showRemove && <RemoveJoinIcon onClick={removeJoin} />}
    </JoinClauseRoot>
  );
}

JoinClause.propTypes = joinClausePropTypes;

const joinDimensionsRightControlPropTypes = {
  isValidJoin: PropTypes.bool.isRequired,
  isFirst: PropTypes.bool.isRequired,
  color: PropTypes.string,
  onAddNewDimensionPair: PropTypes.func.isRequired,
  onRemoveDimensionPair: PropTypes.func.isRequired,
};

function JoinDimensionsRightControl({
  isValidJoin,
  isFirst,
  color,
  onAddNewDimensionPair,
  onRemoveDimensionPair,
}) {
  if (isValidJoin) {
    return (
      <NotebookCellAdd
        color={color}
        className="cursor-pointer ml-auto"
        onClick={onAddNewDimensionPair}
      />
    );
  }
  if (!isFirst) {
    return (
      <RemoveJoinIcon
        onClick={onRemoveDimensionPair}
        size={12}
        data-testid="remove-dimension-pair"
      />
    );
  }
  return null;
}

JoinDimensionsRightControl.propTypes = joinDimensionsRightControlPropTypes;

const joinTablePickerPropTypes = {
  join: PropTypes.object,
  query: PropTypes.object,
  joinedTable: PropTypes.object,
  color: PropTypes.string,
  updateQuery: PropTypes.func,
  onSourceTableSet: PropTypes.func.isRequired,
};

function JoinTablePicker({
  join,
  query,
  joinedTable,
  color,
  updateQuery,
  onSourceTableSet,
}) {
  const databases = [
    query.database(),
    query.database().savedQuestionsDatabase(),
  ].filter(Boolean);

  function onChange(tableId) {
    const newJoin = join
      .setJoinSourceTableId(tableId)
      .setDefaultCondition()
      .setDefaultAlias();
    newJoin.parent().update(updateQuery);
    onSourceTableSet(newJoin);
  }

  return (
    <NotebookCellItem
      color={color}
      inactive={!joinedTable}
      right={
        joinedTable && (
          <JoinFieldsPicker
            join={join}
            updateQuery={updateQuery}
            triggerElement={FieldsPickerIcon}
            triggerStyle={FIELDS_PICKER_STYLES.trigger}
          />
        )
      }
      containerStyle={FIELDS_PICKER_STYLES.notebookItemContainer}
      rightContainerStyle={FIELDS_PICKER_STYLES.notebookRightItemContainer}
    >
      <DataSourceSelector
        hasTableSearch
        canChangeDatabase={false}
        databases={databases}
        tableFilter={table => table.db_id === query.database().id}
        selectedDatabaseId={query.databaseId()}
        selectedTableId={join.joinSourceTableId()}
        setSourceTableFn={onChange}
        isInitiallyOpen={join.joinSourceTableId() == null}
        triggerElement={
          <FieldPickerContentContainer>
            {joinedTable ? joinedTable.displayName() : t`Pick a table...`}
          </FieldPickerContentContainer>
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

  function onChange(strategy) {
    join
      .setStrategy(strategy)
      .parent()
      .update(updateQuery);
  }

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
            onChange(strategy);
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

const joinDimensionCellItemPropTypes = {
  dimension: PropTypes.object,
  onRemove: PropTypes.func.isRequired,
  color: PropTypes.string,
  testID: PropTypes.string,
};

function getDimensionSourceName(dimension) {
  return dimension.field()?.table?.display_name || t`Previous results`;
}

function getDimensionDisplayName(dimension) {
  if (!dimension) {
    return t`Pick a column...`;
  }
  if (isDateTimeField(dimension.mbql())) {
    return `${dimension.displayName()}: ${dimension.subDisplayName()}`;
  }
  return dimension.displayName();
}

function JoinDimensionCellItem({ dimension, color, testID, onRemove }) {
  return (
    <NotebookCellItem color={color} inactive={!dimension} data-testid={testID}>
      <DimensionContainer>
        <div>
          {dimension && (
            <DimensionSourceName>
              {getDimensionSourceName(dimension)}
            </DimensionSourceName>
          )}
          {getDimensionDisplayName(dimension)}
        </div>
        {dimension && <RemoveDimensionIcon onClick={onRemove} />}
      </DimensionContainer>
    </NotebookCellItem>
  );
}

JoinDimensionCellItem.propTypes = joinDimensionCellItemPropTypes;

const joinDimensionPickerPropTypes = {
  dimension: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  options: PropTypes.shape({
    count: PropTypes.number.isRequired,
    fks: PropTypes.array.isRequired,
    dimensions: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  query: PropTypes.object.isRequired,
  color: PropTypes.string,
  "data-testid": PropTypes.string,
};

class JoinDimensionPicker extends React.Component {
  open() {
    this._popover.open();
  }

  render() {
    const { dimension, onChange, onRemove, options, query, color } = this.props;
    const testID = this.props["data-testid"] || "join-dimension";

    function onRemoveDimension(e) {
      e.stopPropagation(); // don't trigger picker popover
      onRemove();
    }

    return (
      <PopoverWithTrigger
        ref={ref => (this._popover = ref)}
        triggerElement={
          <JoinDimensionCellItem
            dimension={dimension}
            color={color}
            testID={testID}
            onRemove={onRemoveDimension}
          />
        }
      >
        {({ onClose }) => (
          <FieldList
            className="text-brand"
            field={dimension && dimension.mbql()}
            fieldOptions={options}
            table={query.table()}
            query={query}
            onFieldChange={(field, { isSubDimension = false } = {}) => {
              if (isDateTimeField(field)) {
                onChange(field, { overwrite: isSubDimension });
              } else {
                onChange(field);
              }
              onClose();
            }}
            enableSubDimensions
            preventNumberSubDimensions
            data-testid={`${testID}-picker`}
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
};

const JoinFieldsPicker = ({ join, updateQuery, ...props }) => {
  const dimensions = join.joinedDimensions();
  const selectedDimensions = join.fieldsDimensions();
  const selected = new Set(selectedDimensions.map(d => d.key()));

  function onSelectAll() {
    join
      .setFields("all")
      .parent()
      .update(updateQuery);
  }

  function onSelectNone() {
    join
      .setFields("none")
      .parent()
      .update(updateQuery);
  }

  function onToggleDimension(dimension) {
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
  }

  return (
    <FieldsPicker
      {...props}
      dimensions={dimensions}
      selectedDimensions={selectedDimensions}
      isAll={join.fields === "all"}
      isNone={join.fields === "none"}
      onSelectAll={onSelectAll}
      onSelectNone={onSelectNone}
      onToggleDimension={onToggleDimension}
    />
  );
};

JoinFieldsPicker.propTypes = joinFieldsPickerPropTypes;
