import DateTime from "metabase/common/components/DateTime";
import { BaseCell } from "metabase/data-grid";
import type { DatetimeUnit } from "metabase-types/api";

import S from "./DateTimeCell.module.css";

export type DateTimeCellProps = {
  value?: string | Date | number;
  unit?: DatetimeUnit;
};

export function DateTimeCell({ value, unit }: DateTimeCellProps) {
  return (
    <BaseCell className={S.cell}>
      {value != null ? <DateTime value={value} unit={unit} /> : null}
    </BaseCell>
  );
}
