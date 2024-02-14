import { t } from "ttag";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import type { DatasetColumn } from "metabase-types/api";
import * as Lib from "metabase-lib";
import {
  isCategory,
  isDate,
  isID,
  isNumber,
} from "metabase-lib/types/utils/isa";
import type Field from "metabase-lib/metadata/Field";
import { Table } from "../MetadataInfo.styled";
import CategoryFingerprint from "./CategoryFingerprint";

type FieldFingerprintInfoProps = {
  className?: string;
  timezone?: string;
  showAllFieldValues?: boolean;
} & (
  | {
      field: Field | DatasetColumn;
    }
  | {
      query: Lib.Query;
      stageIndex: number;
      column: Lib.ColumnMetadata;
    }
);

function FieldFingerprintInfo({
  className,
  timezone,
  showAllFieldValues,
  ...props
}: FieldFingerprintInfoProps) {
  if ("field" in props) {
    const { field } = props;
    if (isDate(field)) {
      return (
        <DateTimeFingerprint
          className={className}
          fingerprintTypeInfo={field.fingerprint?.type?.["type/DateTime"]}
          timezone={timezone}
        />
      );
    } else if (isNumber(field) && !isID(field)) {
      return (
        <NumberFingerprint
          className={className}
          fingerprintTypeInfo={field.fingerprint?.type?.["type/Number"]}
        />
      );
    } else if (isCategory(field)) {
      return (
        <CategoryFingerprint
          className={className}
          field={field}
          showAllFieldValues={showAllFieldValues}
        />
      );
    }
  }

  if ("query" in props) {
    const { query, stageIndex, column } = props;
    const { fingerprint } = Lib.displayInfo(query, stageIndex, column);

    if (Lib.isDate(column)) {
      return (
        <DateTimeFingerprint
          className={className}
          fingerprintTypeInfo={fingerprint?.type?.["type/DateTime"]}
          timezone={timezone}
        />
      );
    } else if (Lib.isNumber(column)) {
      return (
        <NumberFingerprint
          className={className}
          fingerprintTypeInfo={fingerprint?.type?.["type/Number"]}
        />
      );
    } else if (Lib.isCategory(column)) {
      // TODO: Support category fingerprints
      return null;
    }
  }

  return null;
}

type DateTimeFingerprintProps = {
  className?: string;
  fingerprintTypeInfo?: Lib.DateTimeFingerprintDisplayInfo | null;
  timezone?: string;
};

function DateTimeFingerprint({
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

type NumberFingerprintProps = {
  className?: string;
  fingerprintTypeInfo?: Lib.NumberFingerprintDisplayInfo | null;
};

function NumberFingerprint({
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

// eslint-disable-next-line import/no-default-export
export default FieldFingerprintInfo;
