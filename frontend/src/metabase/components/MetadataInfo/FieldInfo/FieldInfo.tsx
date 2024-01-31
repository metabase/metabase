import { t } from "ttag";
import type { DatasetColumn } from "metabase-types/api";
import type Field from "metabase-lib/metadata/Field";
import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
  FieldSemanticTypeLabel,
  FieldFingerprintInfo,
} from "./FieldInfo.styled";

interface FieldInfoProps {
  className?: string;
  field: Field | DatasetColumn;
  timezone?: string;
  showAllFieldValues?: boolean;
}

export function FieldInfo({
  className,
  field,
  timezone,
  showAllFieldValues,
}: FieldInfoProps) {
  return (
    <InfoContainer className={className}>
      {field.description ? (
        <Description>{field.description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <FieldSemanticTypeLabel field={field} />
      <FieldFingerprintInfo
        field={field}
        timezone={timezone}
        showAllFieldValues={showAllFieldValues}
      />
    </InfoContainer>
  );
}

// eslint-disable-next-line import/no-default-export
export default FieldInfo;
