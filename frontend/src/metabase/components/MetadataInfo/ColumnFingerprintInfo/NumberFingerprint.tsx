import { t } from "ttag";

import { isFloat } from "metabase/lib/number";
import type * as Lib from "metabase-lib";

import { Table } from "../MetadataInfo.styled";

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
    <Table className={className}>
      <thead>
        <tr>
          {isAvgNumber && <th>{t`Average`}</th>}
          {isMinNumber && <th>{t`Min`}</th>}
          {isMaxNumber && <th>{t`Max`}</th>}
        </tr>
      </thead>
      <tbody>
        <tr>
          {isAvgNumber && <td>{formattedAvg}</td>}
          {isMinNumber && <td>{formattedMin}</td>}
          {isMaxNumber && <td>{formattedMax}</td>}
        </tr>
      </tbody>
    </Table>
  ) : null;
}

/**
 * @param num - a number value from the type/Number fingerprint; might not be a number
 * @returns - a tuple, [isFormattedNumber, formattedNumber]
 */
function roundNumber(
  num: number | bigint | null | undefined,
): [boolean, string] {
  if (num == null) {
    return [false, ""];
  }

  if (isFloat(num)) {
    return [true, num.toFixed(2)];
  }

  return [true, num.toString()];
}
