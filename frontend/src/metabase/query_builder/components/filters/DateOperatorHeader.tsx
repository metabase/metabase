/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import moment from "moment";
import _ from "underscore";

import { Container, BackButton, TabButton } from "./DateOperatorHeader.styled";
import { DateOperator, DATE_OPERATORS } from "./pickers/DatePicker";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { getExcludeOperator, getHeaderText } from "./pickers/ExcludeDatePicker";

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
  const [mbqlOp, _field, ...values] = filter;
  const dimension = filter.dimension();
  const operator = _.find(operators, o => o.test(filter));
  const tabs = operators.filter(o => o.group === operator?.group);

  if (operator?.name === "exclude") {
    return (
      <Container>
        <BackButton
          primaryColor={primaryColor}
          onClick={() => {
            console.log(">>", filter, dimension, values);
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
