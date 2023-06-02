import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Icon from "metabase/components/Icon";

import {
  InlineOperatorContainer,
  FieldNameContainer,
  FieldTitle,
  TableTitle,
  LightText,
  OperatorDisplay,
  OptionContainer,
  Option,
  FieldIcon,
} from "./InlineOperatorSelector.styled";

interface InlineOperatorSelectorProps {
  fieldName: string;
  iconName?: string;
  tableName?: string;
  value?: string;
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
      <FieldNameContainer>
        {!!iconName && <FieldIcon name={iconName} />}
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
                <OperatorDisplay
                  onClick={onClick}
                  data-testid="operator-select"
                >
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
      </FieldNameContainer>
    </InlineOperatorContainer>
  );
}
