import type Table from "metabase-lib/v1/metadata/Table";

import { Label, LabelContainer } from "../MetadataInfo.styled";

import { TableIcon } from "./TableLabel.styled";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TableLabel;
