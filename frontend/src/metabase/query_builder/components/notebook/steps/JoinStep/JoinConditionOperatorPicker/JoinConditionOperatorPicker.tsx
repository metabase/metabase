import { t } from "ttag";
import * as Lib from "metabase-lib";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
  OperatorPickerButton,
  OperatorList,
  OperatorListItem,
} from "./JoinConditionOperatorPicker.styled";

interface JoinConditionOperatorPickerProps {
  query: Lib.Query;
  stageIndex: number;
  operator?: Lib.JoinConditionOperator;
  operators: Lib.JoinConditionOperator[];
  disabled?: boolean;
  isConditionComplete: boolean;
  onChange: (operator: Lib.JoinConditionOperator) => void;
}

export function JoinConditionOperatorPicker({
  query,
  stageIndex,
  operator: selectedOperator,
  operators,
  disabled,
  isConditionComplete,
  onChange,
}: JoinConditionOperatorPickerProps) {
  const selectedOperatorInfo = selectedOperator
    ? Lib.displayInfo(query, stageIndex, selectedOperator)
    : null;

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ visible, onClick }) => (
        <OperatorPickerButton
          isOpen={visible}
          onClick={onClick}
          disabled={disabled}
          aria-label={t`Change operator`}
          isConditionComplete={isConditionComplete}
        >
          {selectedOperatorInfo?.shortName}
        </OperatorPickerButton>
      )}
      popoverContent={({ closePopover }) => (
        <OperatorList>
          {operators.map(operator => {
            const info = Lib.displayInfo(query, stageIndex, operator);
            return (
              <OperatorListItem
                key={info.shortName}
                id={info.shortName}
                name={info.shortName}
                isSelected={selectedOperatorInfo?.shortName === info.shortName}
                onSelect={() => {
                  onChange(operator);
                  closePopover();
                }}
              />
            );
          })}
        </OperatorList>
      )}
    />
  );
}
