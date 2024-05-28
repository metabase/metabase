import PropTypes from "prop-types";

import Table from "metabase-lib/v1/metadata/Table";

import { LabelContainer, Label } from "../MetadataInfo.styled";

import { TableIcon } from "./TableLabel.styled";

const propTypes = {
  className: PropTypes.string,
  table: PropTypes.instanceOf(Table).isRequired,
};

function TableLabel({
  className,
  table,
}: {
  className?: string;
  table: Table;
}) {
  return (
    <LabelContainer className={className}>
      <TableIcon name="table" />
      <Label>{table.displayName()}</Label>
    </LabelContainer>
  );
}

TableLabel.propTypes = propTypes;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TableLabel;
