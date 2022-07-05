import React, { useMemo, useCallback } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Icon from "metabase/components/Icon";

import {
  InlineOperatorContainer,
  FieldTitle,
  OperatorDisplay,
  OptionContainer,
  Option,
} from "./InlineOperatorSelector.styled";
import { FilterOperatorName } from "metabase-types/types/Metadata";

interface InlineOperatorSelectorProps {
  fieldName: string;
  value?: FilterOperatorName;
  operators?: any[];
  onChange?: (operatorName: string) => void;
}

export function InlineOperatorSelector({
  fieldName,
  value,
  operators,
  onChange,
}: InlineOperatorSelectorProps) {
  const operatorDisplayName =
    operators?.find(o => o.name === value)?.verboseName ?? value;

  const canChangeOperator = !!onChange && !!operators;

  return (
    <InlineOperatorContainer>
      <FieldTitle>{fieldName} </FieldTitle>
      {!canChangeOperator && !!operatorDisplayName && (
        <OperatorDisplay>{operatorDisplayName}</OperatorDisplay>
      )}
      {canChangeOperator && (
        <TippyPopoverWithTrigger
          sizeToFit
          renderTrigger={({ onClick }) => (
            <OperatorDisplay onClick={onClick} data-testid="operator-select">
              {operatorDisplayName} <Icon name="chevrondown" size={8} />
            </OperatorDisplay>
          )}
          popoverContent={({ closePopover }) => (
            <OptionContainer data-testid="operator-options">
              {operators.map(o => (
                <Option
                  key={o.name}
                  onClick={() => {
                    onChange(o.name);
                    closePopover();
                  }}
                >
                  {o.verboseName}
                </Option>
              ))}
            </OptionContainer>
          )}
        />
      )}
    </InlineOperatorContainer>
  );
}
