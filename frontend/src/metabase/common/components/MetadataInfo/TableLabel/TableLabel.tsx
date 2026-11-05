import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type { NormalizedTable } from "metabase-types/api";

import { Label, LabelContainer } from "../MetadataInfo";

import S from "./TableLabel.module.css";

type TableLabelProps = {
  className?: string;
  table: Pick<NormalizedTable, "display_name">;
};

export function TableLabel({ className, table }: TableLabelProps) {
  return (
    // A class, not a color prop, so ConnectedTables can recolor the label on hover
    <LabelContainer className={cx(CS.textBrand, className)}>
      <Icon className={S.icon} name="table" w="1em" h="1em" />
      <Label>{table.display_name}</Label>
    </LabelContainer>
  );
}
