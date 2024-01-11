import { t } from "ttag";
import type Field from "metabase-lib/metadata/Field";
import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
  FieldSemanticTypeLabel,
  FieldFingerprintInfo,
} from "./FieldInfo.styled";

interface FieldInfoProps {
  className?: string;
  field?: Field;
  description?: string;
  showAllFieldValues?: boolean;
}

export function FieldInfo({
  className,
  field,
  description = field?.description ?? undefined,
  showAllFieldValues,
}: FieldInfoProps) {
  return (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <FieldSemanticTypeLabel field={field} />
      <FieldFingerprintInfo
        field={field}
        showAllFieldValues={showAllFieldValues}
      />
    </InfoContainer>
  );
}

// eslint-disable-next-line import/no-default-export
export default FieldInfo;
