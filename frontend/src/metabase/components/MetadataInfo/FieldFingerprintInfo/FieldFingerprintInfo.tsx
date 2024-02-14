import type { DatasetColumn } from "metabase-types/api";
import * as Lib from "metabase-lib";
import {
  isCategory,
  isDate,
  isID,
  isNumber,
} from "metabase-lib/types/utils/isa";
import type Field from "metabase-lib/metadata/Field";

import CategoryFingerprint from "./CategoryFingerprint";
import { DateTimeFingerprint } from "./DateTimeFingerprint";
import { NumberFingerprint } from "./NumberFingerprint";

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

export function FieldFingerprintInfo({
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
          fieldId={field.id}
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
      const info = Lib.fieldValuesSearchInfo(query, column);

      return (
        <CategoryFingerprint
          className={className}
          fieldId={info.fieldId}
          showAllFieldValues={showAllFieldValues}
        />
      );
    }
  }

  return null;
}

// eslint-disable-next-line import/no-default-export
export default FieldFingerprintInfo;
