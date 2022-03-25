/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import { Container, BackButton, TabButton } from "./DateOperatorHeader.styled";
import { DateOperator, DATE_OPERATORS } from "./pickers/DatePicker";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { getHeaderText } from "./pickers/ExcludeDatePicker";

type Props = {
  className?: string;
  isSidebar?: boolean;
  primaryColor?: string;

  filter: Filter;
  operator: string;
  operators?: DateOperator[];
  onBack: () => void;
  onFilterChange: (filter: any[]) => void;
};

export default function DateOperatorHeader({
  operators = DATE_OPERATORS,
  filter,
  primaryColor,
  onFilterChange,
  onBack,
}: Props) {
  const [_op, _field, ...values] = filter;
  const dimension = filter.dimension();
  const operator = _.find(operators, o => o.test(filter));
  const tabs = operators.filter(o => o.group === operator?.group);

  if (operator?.name === "exclude") {
    return (
      <Container>
        <BackButton
          primaryColor={primaryColor}
          onClick={() => {
            if (dimension?.temporalUnit()) {
              onFilterChange([
                "!=",
                dimension.withoutTemporalBucketing().mbql(),
              ]);
            } else {
              onBack();
            }
          }}
          icon="chevronleft"
        >
          {getHeaderText(filter)}
        </BackButton>
      </Container>
    );
  }

  return (
    <Container>
      <BackButton
        primaryColor={primaryColor}
        onClick={() => {
          onBack();
        }}
        icon="chevronleft"
      />
      {tabs.map(({ test, displayName, init }) => (
        <TabButton
          selected={!!test(filter)}
          primaryColor={primaryColor}
          key={displayName}
          onClick={() => {
            onFilterChange(init(filter));
          }}
        >
          {displayName}
        </TabButton>
      ))}
    </Container>
  );
}
