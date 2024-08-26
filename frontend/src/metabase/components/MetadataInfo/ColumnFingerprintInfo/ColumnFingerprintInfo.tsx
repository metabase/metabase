import * as Lib from "metabase-lib";
import type Field from "metabase-lib/v1/metadata/Field";
import {
  isCategory,
  isDate,
  isID,
  isNumber,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn } from "metabase-types/api";

import CategoryFingerprint from "./CategoryFingerprint";
import { DateTimeFingerprint } from "./DateTimeFingerprint";
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
  } else if (isCategory(field)) {
    return (
      <CategoryFingerprint
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

  if (Lib.isTemporal(column)) {
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
    const info = Lib.fieldValuesSearchInfo(query, column);

    return (
      <CategoryFingerprint
        className={className}
        fieldId={info.fieldId}
        showAllFieldValues={showAllFieldValues}
      />
    );
  }

  return null;
}
