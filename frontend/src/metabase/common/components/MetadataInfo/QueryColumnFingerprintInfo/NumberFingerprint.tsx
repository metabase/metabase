import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import type * as Lib from "metabase-lib";

export type NumberFingerprintProps = {
  className?: string;
  fingerprintTypeInfo?: Lib.NumberFingerprintDisplayInfo | null;
};

export function NumberFingerprint({
  className,
  fingerprintTypeInfo,
}: NumberFingerprintProps) {
  if (!fingerprintTypeInfo) {
    return null;
  }

  const { avg, min, max } = fingerprintTypeInfo;
  const [isAvgNumber, formattedAvg] = roundNumber(avg);
  const [isMinNumber, formattedMin] = roundNumber(min);
  const [isMaxNumber, formattedMax] = roundNumber(max);

  const someNumberIsDefined = isAvgNumber || isMinNumber || isMaxNumber;

  return someNumberIsDefined ? (
    <table className={className}>
      <thead>
        <tr>
          {isAvgNumber && <th className={CS.textNormal}>{t`Average`}</th>}
          {isMinNumber && <th className={CS.textNormal}>{t`Min`}</th>}
          {isMaxNumber && <th className={CS.textNormal}>{t`Max`}</th>}
        </tr>
      </thead>
      <tbody>
        <tr>
          {isAvgNumber && <td className={CS.textBold}>{formattedAvg}</td>}
          {isMinNumber && <td className={CS.textBold}>{formattedMin}</td>}
          {isMaxNumber && <td className={CS.textBold}>{formattedMax}</td>}
        </tr>
      </tbody>
    </table>
  ) : null;
}

/**
 * @param num - a number value from the type/Number fingerprint; might not be a number
 * @returns - a tuple, [isFormattedNumber, formattedNumber]
 */
function roundNumber(num: unknown): [boolean, string] {
  if (!isNumber(num)) {
    return [false, ""];
  }

  if (Number.isInteger(num)) {
    return [true, num.toString()];
  }

  return [true, num.toFixed(2)];
}

function isNumber(num: unknown): num is number {
  return typeof num === "number" && Number.isFinite(num) && !Number.isNaN(num);
}
