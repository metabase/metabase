import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type * as Lib from "metabase-lib";

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
    <table className={className}>
      <tbody>
        {timezone && (
          <tr>
            <th className={CS.textNormal}>{t`Timezone`}</th>
            <td className={CS.textBold}>{timezone}</td>
          </tr>
        )}
        <tr>
          <th className={CS.textNormal}>{t`Earliest date`}</th>
          <td className={CS.textBold}>{formattedEarliest}</td>
        </tr>
        <tr>
          <th className={CS.textNormal}>{t`Latest date`}</th>
          <td className={CS.textBold}>{formattedLatest}</td>
        </tr>
      </tbody>
    </table>
  );
}
