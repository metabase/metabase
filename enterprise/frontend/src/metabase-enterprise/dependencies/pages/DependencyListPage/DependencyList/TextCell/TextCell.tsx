import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";

import S from "./TextCell.module.css";

export type TextCellProps = {
  value: string;
};

export function TextCell({ value }: TextCellProps) {
  return (
    <BaseCell className={S.cell}>
      {value != null ? <Ellipsified>{value}</Ellipsified> : null}
    </BaseCell>
  );
}
