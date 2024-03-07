import { t } from "ttag";

import {
  getSemanticTypeIcon,
  getSemanticTypeName,
} from "metabase/lib/schema_metadata";

import {
  LabelContainer,
  Label,
  InvertedColorRelativeSizeIcon,
} from "../MetadataInfo.styled";

type SemanticTypeLabelProps = {
  className?: string;
  semanticType: string | null | undefined;
};

export function SemanticTypeLabel({
  className,
  semanticType,
}: SemanticTypeLabelProps) {
  const semanticTypeIcon = getSemanticTypeIcon(semanticType) || "ellipsis";
  const semanticTypeName =
    getSemanticTypeName(semanticType) || t`No special type`;

  return (
    <LabelContainer className={className}>
      <InvertedColorRelativeSizeIcon name={semanticTypeIcon} />
      <Label>{semanticTypeName}</Label>
    </LabelContainer>
  );
}
