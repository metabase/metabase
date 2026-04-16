import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { SelectList } from "metabase/common/components/SelectList";
import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./JoinConditionOperatorPicker.module.css";

interface JoinConditionOperatorPickerProps {
  query: Lib.Query;
  stageIndex: number;
  operator: Lib.JoinConditionOperator;
  isReadOnly: boolean;
  isConditionComplete: boolean;
  onChange: (operator: Lib.JoinConditionOperator) => void;
}

export function JoinConditionOperatorPicker({
  query,
  stageIndex,
  operator,
  isReadOnly,
  isConditionComplete,
  onChange,
}: JoinConditionOperatorPickerProps) {
  const [isOpened, setIsOpened] = useState(false);

  const handleChange = (operator: Lib.JoinConditionOperator) => {
    onChange(operator);
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <button
          className={cx(S.OperatorPickerButton, {
            [S.disabled]: isReadOnly,
            [S.completeCondition]: isConditionComplete,
            [S.incompleteCondition]: !isConditionComplete,
            [S.isOpened]: isOpened,
          })}
          disabled={isReadOnly}
          aria-label={t`Change operator`}
          onClick={() => setIsOpened(!isOpened)}
        >
          {operator}
        </button>
      </Popover.Target>
      <Popover.Dropdown>
        <JoinConditionOperatorDropdown
          query={query}
          stageIndex={stageIndex}
          operator={operator}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface JoinConditionOperatorDropdownProps {
  query: Lib.Query;
  stageIndex: number;
  operator: Lib.JoinConditionOperator;
  onChange: (operator: Lib.JoinConditionOperator) => void;
}

function JoinConditionOperatorDropdown({
  query,
  stageIndex,
  operator: selectedOperator,
  onChange,
}: JoinConditionOperatorDropdownProps) {
  const availableOperators = useMemo(
    () => Lib.joinConditionOperators(query, stageIndex),
    [query, stageIndex],
  );

  return (
    <SelectList className={S.OperatorList}>
      {availableOperators.map((availableOperator, index) => {
        return (
          <SelectList.Item
            className={S.OperatorListItem}
            id={index}
            key={index}
            name={availableOperator}
            isSelected={selectedOperator === availableOperator}
            onSelect={() => onChange(availableOperator)}
          />
        );
      })}
    </SelectList>
  );
}
