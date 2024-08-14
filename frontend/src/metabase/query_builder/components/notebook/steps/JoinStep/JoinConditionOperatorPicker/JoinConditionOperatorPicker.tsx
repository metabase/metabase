import { useMemo, useState } from "react";
import { t } from "ttag";

import { Popover } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  OperatorPickerButton,
  OperatorList,
  OperatorListItem,
} from "./JoinConditionOperatorPicker.styled";

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

  const operatorInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, operator),
    [query, stageIndex, operator],
  );

  const handleChange = (operator: Lib.JoinConditionOperator) => {
    onChange(operator);
    setIsOpened(false);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onChange={setIsOpened}>
      <Popover.Target>
        <OperatorPickerButton
          isOpened={isOpened}
          isConditionComplete={isConditionComplete}
          disabled={isReadOnly}
          aria-label={t`Change operator`}
          onClick={() => setIsOpened(!isOpened)}
        >
          {operatorInfo.shortName}
        </OperatorPickerButton>
      </Popover.Target>
      <Popover.Dropdown>
        <JoinConditionOperatorDropdown
          query={query}
          stageIndex={stageIndex}
          operatorInfo={operatorInfo}
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface JoinConditionOperatorDropdownProps {
  query: Lib.Query;
  stageIndex: number;
  operatorInfo: Lib.JoinConditionOperatorDisplayInfo;
  onChange: (operator: Lib.JoinConditionOperator) => void;
}

function JoinConditionOperatorDropdown({
  query,
  stageIndex,
  operatorInfo,
  onChange,
}: JoinConditionOperatorDropdownProps) {
  const items = useMemo(
    () =>
      Lib.joinConditionOperators(query, stageIndex).map(operator => ({
        operator,
        operatorInfo: Lib.displayInfo(query, stageIndex, operator),
      })),
    [query, stageIndex],
  );

  return (
    <OperatorList>
      {items.map((item, index) => {
        return (
          <OperatorListItem
            id={index}
            key={index}
            name={item.operatorInfo.shortName}
            isSelected={operatorInfo.shortName === item.operatorInfo.shortName}
            onSelect={() => onChange(item.operator)}
          />
        );
      })}
    </OperatorList>
  );
}
