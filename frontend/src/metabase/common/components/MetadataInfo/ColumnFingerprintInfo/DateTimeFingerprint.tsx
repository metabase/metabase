import { t } from "ttag";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import type * as Lib from "metabase-lib";

import { Table } from "../MetadataInfo.styled";

export type DateTimeFingerprintProps = {
  className?: string;
  fingerprintTypeInfo?: Lib.DateTimeFingerprintDisplayInfo | null;
  timezone?: string;
};

export function DateTimeFingerprint({
  className,
  fingerprintTypeInfo,
  timezone,
}: DateTimeFingerprintProps) {
  if (!fingerprintTypeInfo) {
    return null;
  }

  const { earliest, latest } = fingerprintTypeInfo;
  const formattedEarliest = formatDateTimeWithUnit(earliest, "minute");
  const formattedLatest = formatDateTimeWithUnit(latest, "minute");

  return (
    <Table className={className}>
      <tbody>
        {timezone && (
          <tr>
            <th>{t`Timezone`}</th>
            <td>{timezone}</td>
          </tr>
        )}
        <tr>
          <th>{t`Earliest date`}</th>
          <td>{formattedEarliest}</td>
        </tr>
        <tr>
          <th>{t`Latest date`}</th>
          <td>{formattedLatest}</td>
        </tr>
      </tbody>
    </Table>
  );
}
