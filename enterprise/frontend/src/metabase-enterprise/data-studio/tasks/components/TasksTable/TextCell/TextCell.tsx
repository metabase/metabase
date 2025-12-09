import { Ellipsified } from "metabase/common/components/Ellipsified";
import { BaseCell } from "metabase/data-grid";

export type TextCellAlign = "left" | "right";

export type TextCellProps = {
  value: string;
  align?: TextCellAlign;
};

export function TextCell({ value, align = "left" }: TextCellProps) {
  return (
    <BaseCell align={align}>
      <Ellipsified>{value}</Ellipsified>
    </BaseCell>
  );
}
