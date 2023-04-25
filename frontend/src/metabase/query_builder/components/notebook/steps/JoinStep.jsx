import React, { useRef } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import { DataSourceSelector } from "metabase/query_builder/components/DataSelector";
import { DATA_BUCKET } from "metabase/query_builder/components/DataSelector/constants";
import FieldList from "metabase/query_builder/components/FieldList";
import Select from "metabase/core/components/Select";
import { isDateTimeField } from "metabase-lib/queries/utils/field-ref";
import Join from "metabase-lib/queries/structured/Join";
import Question from "metabase-lib/Question";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import { NotebookCellAdd, NotebookCellItem } from "../NotebookCell";
import {
  FieldPickerContentContainer,
  FIELDS_PICKER_STYLES,
  FieldsPickerIcon,
} from "../FieldsPickerIcon";
import FieldsPicker from "./FieldsPicker";
import {
  DimensionContainer,
  DimensionSourceName,
  JoinClauseContainer,
  JoinClauseRoot,
  JoinClausesContainer,
  JoinConditionLabel,
  JoinDimensionControlsContainer,
  JoinOperatorButton,
  JoinStepRoot,
  JoinStrategyIcon,
  JoinTypeIcon,
  JoinTypeOptionRoot,
  JoinTypeSelectRoot,
  JoinWhereConditionLabel,
  JoinWhereConditionLabelContainer,
  PrimaryJoinCell,
  RemoveDimensionIcon,
  RemoveJoinIcon,
  Row,
  SecondaryJoinCell,
} from "./JoinStep.styled";

const stepShape = {
  id: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  query: PropTypes.object.isRequired,
  topLevelQuery: PropTypes.object.isRequired,
  previewQuery: PropTypes.object,
  active: PropTypes.bool.isRequired,
  valid: PropTypes.bool.isRequired,
  visible: PropTypes.bool.isRequired,
  stageIndex: PropTypes.number.isRequired,
  itemIndex: PropTypes.number,
  testID: PropTypes.string.isRequired,
  update: PropTypes.func.isRequired,
  revert: PropTypes.func.isRequired,
  clean: PropTypes.func.isRequired,
  actions: PropTypes.array.isRequired,
  next: PropTypes.object,
  previous: PropTypes.object,
};

const joinStepPropTypes = {
  query: PropTypes.instanceOf(StructuredQuery).isRequired,
  topLevelQuery: PropTypes.object.isRequired,
  step: PropTypes.shape(stepShape).isRequired,
  color: PropTypes.string.isRequired,
  isLastOpened: PropTypes.bool,
  updateQuery: PropTypes.func.isRequired,
  sourceQuestion: PropTypes.instanceOf(Question),
  readOnly: PropTypes.bool,
};

const JOIN_OPERATOR_OPTIONS = [
  { name: "=", value: "=" },
  { name: ">", value: ">" },
  { name: "<", value: "<" },
  { name: "≥", value: ">=" },
  { name: "≤", value: "<=" },
  { name: "≠", value: "!=" },
];

export default function JoinStep({
  color,
  query,
  step,
  updateQuery,
  isLastOpened,
  sourceQuestion,
  readOnly,
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
    updateQuery(query.join(new Join({ fields: "all" })));
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
                sourceQuestion={sourceQuestion}
                readOnly={readOnly}
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
  sourceQuestion: PropTypes.object,
  showRemove: PropTypes.bool,
  updateQuery: PropTypes.func,
  readOnly: PropTypes.bool,
};

function JoinClause({
  color,
  join,
  sourceQuestion,
  updateQuery,
  showRemove,
  readOnly,
}) {
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
    updateQuery(
      join
        .setParentDimension({
          index,
          dimension: fieldRef,
          overwriteTemporalUnit: overwrite,
        })
        .setDefaultAlias()
        .parent(),
    );
    if (!join.joinDimensions()[index]) {
      joinDimensionPickersRef.current[index]?.open();
    }
  }

  function onJoinDimensionChange(index, fieldRef, { overwrite } = {}) {
    updateQuery(
      join
        .setJoinDimension({
          index,
          dimension: fieldRef,
          overwriteTemporalUnit: overwrite,
        })
        .parent(),
    );
  }

  function addNewDimensionsPair(index) {
    updateQuery(join.addEmptyDimensionsPair().parent());

    // Need to wait, so a new dimensions pair renders
    // and a corresponding ref is created, so we can reference it here
    setTimeout(() => {
      parentDimensionPickersRef.current[index]?.open();
    });
  }

  function removeJoin() {
    updateQuery(join.remove());
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
          readOnly={readOnly}
          query={query}
          joinedTable={joinedTable}
          color={color}
          sourceQuestion={sourceQuestion}
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
              const operator = condition[0] ?? "=";
              const operatorSymbol = JOIN_OPERATOR_OPTIONS.find(
                o => o.value === operator,
              )?.name;

              function removeParentDimension() {
                updateQuery(
                  join.setParentDimension({ index, dimension: null }).parent(),
                );
              }

              function removeJoinDimension() {
                updateQuery(
                  join.setJoinDimension({ index, dimension: null }).parent(),
                );
              }

              function removeDimensionPair() {
                updateQuery(join.removeCondition(index).parent());
              }

              function updateOperator({ target: { value } }) {
                updateQuery(join.setOperator(index, value).parent());
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
                      readOnly={readOnly}
                      data-testid="parent-dimension"
                    />
                    <JoinConditionLabel>
                      <Select
                        hiddenIcons
                        width={80}
                        value={operator ?? "="}
                        onChange={updateOperator}
                        options={JOIN_OPERATOR_OPTIONS}
                        triggerElement={
                          <JoinOperatorButton primary>
                            {operatorSymbol}
                          </JoinOperatorButton>
                        }
                      />
                    </JoinConditionLabel>
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
                      readOnly={readOnly}
                      data-testid="join-dimension"
                    />
                    {!readOnly &&
                      (isLast ? (
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
                      ))}
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
  sourceQuestion: PropTypes.object,
  updateQuery: PropTypes.func,
  onSourceTableSet: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
};

function JoinTablePicker({
  join,
  query,
  joinedTable,
  color,
  sourceQuestion,
  updateQuery,
  onSourceTableSet,
  readOnly,
}) {
  const databases = [
    query.database(),
    query.database().savedQuestionsDatabase(),
  ].filter(Boolean);

  const sourceDataBucketId =
    sourceQuestion != null && sourceQuestion.isDataset()
      ? DATA_BUCKET.DATASETS
      : undefined;
  const hasSourceTable = join.joinSourceTableId() != null;

  function onChange(tableId) {
    const newJoin = join
      .setJoinSourceTableId(tableId)
      .setDefaultCondition()
      .setDefaultAlias();
    updateQuery(newJoin.parent());
    onSourceTableSet(newJoin);
  }

  return (
    <NotebookCellItem
      color={color}
      inactive={!joinedTable}
      readOnly={readOnly}
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
        selectedDataBucketId={hasSourceTable ? undefined : sourceDataBucketId}
        selectedDatabaseId={query.databaseId()}
        selectedTableId={join.joinSourceTableId()}
        setSourceTableFn={onChange}
        isInitiallyOpen={!hasSourceTable}
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
    updateQuery(join.setStrategy(strategy).parent());
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
            {t`Choose a join type`}
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
  readOnly: PropTypes.bool,
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

function JoinDimensionCellItem({
  dimension,
  color,
  testID,
  onRemove,
  readOnly,
}) {
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
        {dimension && !readOnly && <RemoveDimensionIcon onClick={onRemove} />}
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
  readOnly: PropTypes.bool,
  "data-testid": PropTypes.string,
};

class JoinDimensionPicker extends React.Component {
  open() {
    this._popover.open();
  }

  render() {
    const { dimension, onChange, onRemove, options, query, color, readOnly } =
      this.props;
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
            readOnly={readOnly}
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
    updateQuery(join.setFields("all").parent());
  }

  function onSelectNone() {
    updateQuery(join.setFields("none").parent());
  }

  function onToggleDimension(dimension) {
    updateQuery(
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
        .parent(),
    );
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
