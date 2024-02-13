import { t } from "ttag";
import type { DatasetColumn } from "metabase-types/api";
import type Field from "metabase-lib/metadata/Field";
import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
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
      <SemanticTypeLabel semanticType={field.semantic_type} />
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

// eslint-disable-next-line import/no-default-export
export default FieldInfo;
