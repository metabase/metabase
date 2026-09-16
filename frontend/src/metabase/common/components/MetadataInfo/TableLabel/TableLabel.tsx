import type { NormalizedTable } from "metabase-types/api";

import { Label, LabelContainer } from "../MetadataInfo.styled";

import { TableIcon } from "./TableLabel.styled";

export function TableLabel({
  className,
  table,
}: {
  className?: string;
  table: Pick<NormalizedTable, "display_name">;
}) {
  return (
    <LabelContainer className={className}>
      <TableIcon name="table" />
      <Label>{table.display_name}</Label>
    </LabelContainer>
  );
}
