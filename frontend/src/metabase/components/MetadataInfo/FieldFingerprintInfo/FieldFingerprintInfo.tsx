import { t } from "ttag";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import type { DatasetColumn } from "metabase-types/api";
import {
  isCategory,
  isDate,
  isID,
  isNumber,
} from "metabase-lib/types/utils/isa";
import type Field from "metabase-lib/metadata/Field";
import { Table } from "../MetadataInfo.styled";
import CategoryFingerprint from "./CategoryFingerprint";

interface FieldFingerprintInfoProps {
  className?: string;
  field: Field | DatasetColumn;
  timezone?: string;
  showAllFieldValues?: boolean;
}

function FieldFingerprintInfo({
  className,
  field,
  timezone,
  showAllFieldValues,
}: FieldFingerprintInfoProps) {
  if (isDate(field)) {
    return (
      <DateTimeFingerprint
        className={className}
        field={field}
        timezone={timezone}
      />
    );
  } else if (isNumber(field) && !isID(field)) {
    return <NumberFingerprint className={className} field={field} />;
  } else if (isCategory(field)) {
    return (
      <CategoryFingerprint
        className={className}
        field={field}
        showAllFieldValues={showAllFieldValues}
      />
    );
  } else {
    return null;
  }
}

function DateTimeFingerprint({
  className,
  field,
  timezone,
}: FieldFingerprintInfoProps) {
  const dateTimeFingerprint = field.fingerprint?.type?.["type/DateTime"];
  if (!dateTimeFingerprint) {
    return null;
  }

  const { earliest, latest } = dateTimeFingerprint;
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

/**
 * @param num - a number value from the type/Number fingerprint; might not be a number
 * @returns - a tuple, [isFormattedNumber, formattedNumber]
 */
function roundNumber(num: number | null | undefined): [boolean, string] {
  if (num == null) {
    return [false, ""];
  }

  return [true, Number.isInteger(num) ? num.toString() : num.toFixed(2)];
}

function NumberFingerprint({ className, field }: FieldFingerprintInfoProps) {
  const numberFingerprint = field.fingerprint?.type?.["type/Number"];
  if (!numberFingerprint) {
    return null;
  }

  const { avg, min, max } = numberFingerprint;
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

// eslint-disable-next-line import/no-default-export
export default FieldFingerprintInfo;
