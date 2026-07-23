import * as Lib from "metabase-lib";

import { DateTimeFingerprint } from "./DateTimeFingerprint";
import { GlobalFingerprint } from "./GlobalFingerprint";
import { NumberFingerprint } from "./NumberFingerprint";

type BaseProps = {
  className?: string;
  timezone?: string;
  showAllFieldValues?: boolean;
};

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
  } else if (Lib.isNumeric(column) && !Lib.isID(column)) {
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
