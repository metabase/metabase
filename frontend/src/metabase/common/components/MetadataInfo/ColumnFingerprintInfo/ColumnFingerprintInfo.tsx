import * as Lib from "metabase-lib";
import type Field from "metabase-lib/v1/metadata/Field";
import { isDate, isID, isNumber } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import { DateTimeFingerprint } from "./DateTimeFingerprint";
import { GlobalFingerprint } from "./GlobalFingerprint";
import { NumberFingerprint } from "./NumberFingerprint";

type BaseProps = {
  className?: string;
  timezone?: string;
  showAllFieldValues?: boolean;
};

type TableColumnFingerprintInfoProps = BaseProps & {
  field: Field | DatasetColumn;
};

/**
 * @deprecated - Use QueryColumnFingerprintInfo instead.
 */
export function TableColumnFingerprintInfo({
  className,
  timezone,
  field,
  showAllFieldValues,
}: TableColumnFingerprintInfoProps) {
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
  } else if (typeof field.id === "number") {
    return (
      <GlobalFingerprint
        className={className}
        fieldId={field.id}
        showAllFieldValues={showAllFieldValues}
      />
    );
  }

  return null;
}

type QueryColumnFingerprintInfoProps = BaseProps & {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
};

export function QueryColumnFingerprintInfo({
  className,
  timezone,
  query,
  stageIndex,
  column,
  showAllFieldValues,
}: QueryColumnFingerprintInfoProps) {
  const { fingerprint } = Lib.displayInfo(query, stageIndex, column);
  const fieldInfo = Lib.fieldValuesSearchInfo(query, column);

  if (Lib.isTemporal(column)) {
    return (
      <DateTimeFingerprint
        className={className}
        fingerprintTypeInfo={fingerprint?.type?.["type/DateTime"]}
        timezone={timezone}
      />
    );
  } else if (Lib.isNumeric(column)) {
    return (
      <NumberFingerprint
        className={className}
        fingerprintTypeInfo={fingerprint?.type?.["type/Number"]}
      />
    );
  } else if (fieldInfo.fieldId != null) {
    return (
      <GlobalFingerprint
        className={className}
        fieldId={fieldInfo.fieldId}
        showAllFieldValues={showAllFieldValues}
      />
    );
  }

  return null;
}
