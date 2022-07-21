import React, { useMemo, useCallback } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Icon from "metabase/components/Icon";

import {
  InlineOperatorContainer,
  FieldTitle,
  TableTitle,
  LightText,
  OperatorDisplay,
  OptionContainer,
  Option,
} from "./InlineOperatorSelector.styled";
import { FilterOperatorName } from "metabase-types/types/Metadata";

interface InlineOperatorSelectorProps {
  fieldName: string;
  iconName?: string;
  tableName?: string;
  value?: FilterOperatorName;
  operators?: any[];
  onChange?: (operatorName: string) => void;
}

export function InlineOperatorSelector({
  fieldName,
  iconName,
  tableName,
  value,
  operators,
  onChange,
}: InlineOperatorSelectorProps) {
  const operatorDisplayName =
    operators?.find(o => o.name === value)?.verboseName ?? value;

  const canChangeOperator = !!onChange && !!operators;

  return (
    <InlineOperatorContainer>
      {!!iconName && (
        <Icon name={iconName} size={20} style={{ marginRight: 8 }} />
      )}
      <div>
        <FieldTitle>{fieldName}</FieldTitle>
        {!!tableName && (
          <TableTitle>
            <LightText>in</LightText>
            {` ${tableName}`}
          </TableTitle>
        )}
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
                {operators.map(option => (
                  <Option
                    key={option.name}
                    onClick={() => {
                      onChange(option.name);
                      closePopover();
                    }}
                  >
                    {option.verboseName}
                  </Option>
                ))}
              </OptionContainer>
            )}
          />
        )}
      </div>
    </InlineOperatorContainer>
  );
}
