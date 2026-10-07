import type { ColorName } from "metabase/ui/colors/types";
import type { NormalizedTable } from "metabase-types/api";

import {
  Label,
  LabelContainer,
  RelativeSizeIcon,
} from "../MetadataInfo.styled";

import S from "./TableLabel.module.css";

type TableLabelProps = {
  className?: string;
  table: Pick<NormalizedTable, "display_name">;
  color?: ColorName;
};

export function TableLabel({ className, table, color }: TableLabelProps) {
  return (
    <LabelContainer className={className} color={color}>
      <RelativeSizeIcon className={S.icon} name="table" />
      <Label>{table.display_name}</Label>
    </LabelContainer>
  );
}
