import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { SelectList } from "metabase/common/components/SelectList";
import { Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import { JoinConditionColumnPicker } from "../../JoinStep/JoinConditionColumnPicker";

import S from "./nodes.module.css";

type JoinConditionRowProps = {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  // Undefined means the row is a draft: it commits once both sides are picked.
  condition?: Lib.JoinCondition;
  lhsTableName: string;
  rhsTableName: string;
  isReadOnly: boolean;
  isRemovable: boolean;
  onChange: (newCondition: Lib.JoinCondition) => void;
  onRemove: () => void;
};

// One join condition as three separate controls spanning the block: left
// column, operator, right column. Each one opens its own picker.
export function JoinConditionRow({
  query,
  stageIndex,
  join,
  condition,
  lhsTableName,
  rhsTableName,
  isReadOnly,
  isRemovable,
  onChange,
  onRemove,
}: JoinConditionRowProps) {
  const isDraft = condition == null;
  const strategy = useMemo(() => Lib.joinStrategy(join), [join]);
  const parts = useMemo(
    () => (condition ? Lib.joinConditionParts(condition) : null),
    [condition],
  );

  const [draftOperator, setDraftOperator] = useState(
    () => Lib.joinConditionOperators(query, stageIndex)[0],
  );
  const [draftLhs, setDraftLhs] = useState<Lib.ExpressionClause>();
  const [draftRhs, setDraftRhs] = useState<Lib.ExpressionClause>();
  const [draftLhsBucket, setDraftLhsBucket] = useState<Lib.Bucket | null>(null);
  const [draftRhsBucket, setDraftRhsBucket] = useState<Lib.Bucket | null>(null);
  const [isLhsOpened, setIsLhsOpened] = useState(isDraft);
  const [isRhsOpened, setIsRhsOpened] = useState(false);

  const operator = parts ? parts.operator : draftOperator;
  const lhsExpression = parts ? parts.lhsExpression : draftLhs;
  const rhsExpression = parts ? parts.rhsExpression : draftRhs;

  const withBucket = (
    newCondition: Lib.JoinCondition,
    bucket: Lib.Bucket | null,
  ) =>
    Lib.joinConditionUpdateTemporalBucketing(
      query,
      stageIndex,
      newCondition,
      bucket,
    );

  // Draft rows only commit once both columns are known; the bucket of the
  // first side that has a real one wins, mirroring the notebook.
  const commitDraft = (
    lhs: Lib.ExpressionClause | undefined,
    rhs: Lib.ExpressionClause | undefined,
    lhsBucket: Lib.Bucket | null,
    rhsBucket: Lib.Bucket | null,
  ) => {
    if (lhs == null || rhs == null) {
      return;
    }
    const nonDefault = (bucket: Lib.Bucket | null) =>
      bucket != null &&
      Lib.displayInfo(query, stageIndex, bucket).shortName === "default"
        ? null
        : bucket;
    const bucket =
      nonDefault(lhsBucket) ?? nonDefault(rhsBucket) ?? lhsBucket ?? rhsBucket;
    onChange(
      withBucket(Lib.joinConditionClause(draftOperator, lhs, rhs), bucket),
    );
  };

  const handleOperatorChange = (newOperator: Lib.JoinConditionOperator) => {
    if (parts) {
      onChange(
        Lib.joinConditionClause(
          newOperator,
          parts.lhsExpression,
          parts.rhsExpression,
        ),
      );
    } else {
      setDraftOperator(newOperator);
    }
  };

  const handleLhsChange = (
    newLhs: Lib.ExpressionClause,
    newBucket: Lib.Bucket | null,
  ) => {
    if (parts) {
      onChange(
        withBucket(
          Lib.joinConditionClause(parts.operator, newLhs, parts.rhsExpression),
          newBucket,
        ),
      );
    } else {
      setDraftLhs(newLhs);
      setDraftLhsBucket(newBucket);
      setIsRhsOpened(true);
      commitDraft(newLhs, draftRhs, newBucket, draftRhsBucket);
    }
  };

  const handleRhsChange = (
    newRhs: Lib.ExpressionClause,
    newBucket: Lib.Bucket | null,
  ) => {
    if (parts) {
      onChange(
        withBucket(
          Lib.joinConditionClause(parts.operator, parts.lhsExpression, newRhs),
          newBucket,
        ),
      );
    } else {
      setDraftRhs(newRhs);
      setDraftRhsBucket(newBucket);
      commitDraft(draftLhs, newRhs, draftLhsBucket, newBucket);
    }
  };

  return (
    <div className={S.conditionRow}>
      <div className={S.conditionSide}>
        <JoinConditionColumnPicker
          query={query}
          stageIndex={stageIndex}
          joinable={join}
          strategy={strategy}
          tableName={lhsTableName}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isOpened={isLhsOpened}
          isLhsPicker={true}
          isReadOnly={isReadOnly}
          onChange={handleLhsChange}
          onOpenChange={setIsLhsOpened}
        />
      </div>
      <OperatorChip
        query={query}
        stageIndex={stageIndex}
        operator={operator}
        isReadOnly={isReadOnly}
        onChange={handleOperatorChange}
      />
      <div className={S.conditionSide}>
        <JoinConditionColumnPicker
          query={query}
          stageIndex={stageIndex}
          joinable={join}
          strategy={strategy}
          tableName={rhsTableName}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isOpened={isRhsOpened}
          isLhsPicker={false}
          isReadOnly={isReadOnly}
          onChange={handleRhsChange}
          onOpenChange={setIsRhsOpened}
        />
      </div>
      {!isReadOnly && isRemovable && (
        <button
          type="button"
          className={S.conditionRemove}
          aria-label={t`Remove condition`}
          onClick={onRemove}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

type OperatorChipProps = {
  query: Lib.Query;
  stageIndex: number;
  operator: Lib.JoinConditionOperator;
  isReadOnly: boolean;
  onChange: (newOperator: Lib.JoinConditionOperator) => void;
};

function OperatorChip({
  query,
  stageIndex,
  operator,
  isReadOnly,
  onChange,
}: OperatorChipProps) {
  const [isOpened, setIsOpened] = useState(false);
  const operators = useMemo(
    () => Lib.joinConditionOperators(query, stageIndex),
    [query, stageIndex],
  );

  return (
    <Popover
      opened={isOpened}
      position="bottom"
      onChange={setIsOpened}
      disabled={isReadOnly}
    >
      <Popover.Target>
        <button
          type="button"
          className={cx(S.conditionOperator, { [S.opened]: isOpened })}
          disabled={isReadOnly}
          aria-label={t`Change operator`}
          onClick={() => setIsOpened((opened) => !opened)}
        >
          {operator}
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <SelectList className={S.operatorList}>
          {operators.map((item, index) => (
            <SelectList.Item
              id={index}
              key={index}
              name={item}
              isSelected={item === operator}
              onSelect={() => {
                onChange(item);
                setIsOpened(false);
              }}
            />
          ))}
        </SelectList>
      </Popover.Dropdown>
    </Popover>
  );
}
