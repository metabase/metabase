import { t } from "ttag";
import type { DatasetColumn } from "metabase-types/api";
import * as Lib from "metabase-lib";
import type Field from "metabase-lib/metadata/Field";
import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
  FieldSemanticTypeLabel,
  SemanticTypeLabel,
  FieldFingerprintInfo,
} from "./FieldInfo.styled";

interface FieldInfoProps {
  className?: string;
  field: Field | DatasetColumn;
  timezone?: string;
  showAllFieldValues?: boolean;
  showFingerprintInfo?: boolean;
}

export function FieldInfo({
  className,
  field,
  timezone,
  showAllFieldValues,
  showFingerprintInfo,
}: FieldInfoProps) {
  return (
    <InfoContainer className={className}>
      {field.description ? (
        <Description>{field.description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <FieldSemanticTypeLabel field={field} />
      {showFingerprintInfo && (
        <FieldFingerprintInfo
          field={field}
          timezone={timezone}
          showAllFieldValues={showAllFieldValues}
        />
      )}
    </InfoContainer>
  );
}

interface FieldInfoPropsMLv2 {
  className?: string;
  query: Lib.Query;
  column: Lib.ColumnMetadata;
  stage?: number;
  timezone?: string;
  showAllFieldValues?: boolean;
  showFingerprintInfo?: boolean;
}

export function FieldInfoMLv2({
  className,
  query,
  column,
  stage = -1,
}: // timezone,
// showAllFieldValues,
// showFingerprintInfo,
FieldInfoPropsMLv2) {
  const { description, semanticType } = Lib.displayInfo(query, stage, column);

  return (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <SemanticTypeLabel semanticType={semanticType} />
      {/* {showFingerprintInfo && ( */}
      {/*   <FieldFingerprintInfo */}
      {/*     field={field} */}
      {/*     timezone={timezone} */}
      {/*     showAllFieldValues={showAllFieldValues} */}
      {/*   /> */}
      {/* )} */}
    </InfoContainer>
  );
}

// eslint-disable-next-line import/no-default-export
export default FieldInfo;
