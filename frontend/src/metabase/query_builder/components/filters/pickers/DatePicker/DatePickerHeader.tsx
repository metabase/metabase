import React from "react";
import _ from "underscore";

import { Container, BackButton, TabButton } from "./DatePickerHeader.styled";
import { DateOperator, DATE_OPERATORS } from "./DatePicker";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { getHeaderText } from "./ExcludeDatePicker";

type Props = {
  className?: string;
  isSidebar?: boolean;
  primaryColor?: string;

  filter: Filter;
  operators?: DateOperator[];
  onBack?: () => void;
  onFilterChange: (filter: any[]) => void;
};

export default function DatePickerHeader({
  operators = DATE_OPERATORS,
  filter,
  primaryColor,
  onFilterChange,
  onBack,
}: Props) {
  const [_op, _field] = filter;
  const dimension = filter.dimension?.();
  const operator = _.find(operators, o => o.test(filter));
  const tabs = operators.filter(o => o.group === operator?.group);
  const selectedTab = operators.find(o => o.test(filter));

  if (operator?.name === "exclude") {
    const hasTemporalUnit = dimension?.temporalUnit();
    return onBack || hasTemporalUnit ? (
      <Container>
        <BackButton
          primaryColor={primaryColor}
          onClick={() => {
            if (hasTemporalUnit) {
              onFilterChange([
                "!=",
                dimension?.withoutTemporalBucketing().mbql(),
              ]);
            } else {
              onBack?.();
            }
          }}
          icon="chevronleft"
        >
          {getHeaderText(filter)}
        </BackButton>
      </Container>
    ) : null;
  }

  return (
    <Container>
      {onBack ? (
        <BackButton
          primaryColor={primaryColor}
          onClick={onBack}
          icon="chevronleft"
        />
      ) : null}
      {tabs.map(tab => (
        <TabButton
          selected={tab === selectedTab}
          primaryColor={primaryColor}
          key={tab.displayName}
          onClick={() => {
            onFilterChange(
              tab.init(dimension?.withoutTemporalBucketing().mbql() as any),
            );
          }}
        >
          {tab.displayName}
        </TabButton>
      ))}
    </Container>
  );
}
