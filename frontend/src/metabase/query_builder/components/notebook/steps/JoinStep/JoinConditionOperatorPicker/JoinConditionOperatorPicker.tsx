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
  operator?: Lib.FilterOperator;
  operators: Lib.FilterOperator[];
  onChange: (operator: Lib.FilterOperator) => void;
}

export function JoinConditionOperatorPicker({
  query,
  stageIndex,
  operator: selectedOperator,
  operators,
  onChange,
}: JoinConditionOperatorPickerProps) {
  const selectedOperatorInfo = selectedOperator
    ? Lib.displayInfo(query, stageIndex, selectedOperator)
    : null;

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) => (
        <OperatorPickerButton onClick={onClick} aria-label={t`Change operator`}>
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
