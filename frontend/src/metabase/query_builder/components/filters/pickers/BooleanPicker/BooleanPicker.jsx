import React from "react";
import { PropTypes } from "prop-types";
import _ from "underscore";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import Filter from "metabase-lib/lib/queries/structured/Filter";

import { Container, Toggle, FilterRadio } from "./BooleanPicker.styled";

BooleanPicker.propTypes = {
  className: PropTypes.string,
  filter: PropTypes.instanceOf(Filter),
  onFilterChange: PropTypes.func.isRequired,
};

const OPTIONS = [
  { name: t`true`, value: true },
  { name: t`false`, value: false },
];
const EXPANDED_OPTIONS = [
  { name: t`true`, value: true },
  { name: t`false`, value: false },
  { name: t`empty`, value: "is-null" },
  { name: t`not empty`, value: "not-null" },
];

function BooleanPicker({ className, filter, onFilterChange }) {
  const value = getValue(filter);
  const [isExpanded, { toggle }] = useToggle(!_.isBoolean(value));

  const updateFilter = value => {
    if (_.isBoolean(value)) {
      onFilterChange(filter.setOperator("=").setArguments([value]));
    } else {
      onFilterChange(filter.setOperator(value));
    }
  };

  return (
    <Container className={className}>
      <FilterRadio
        vertical
        colorScheme="accent7"
        options={isExpanded ? EXPANDED_OPTIONS : OPTIONS}
        value={value}
        onChange={updateFilter}
      />
      {!isExpanded && <Toggle onClick={toggle} />}
    </Container>
  );
}

function getValue(filter) {
  const operatorName = filter.operatorName();
  if (operatorName === "=") {
    const [value] = filter.arguments();
    return value;
  } else {
    return operatorName;
  }
}

export default BooleanPicker;
