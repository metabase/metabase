import { t } from "ttag";

import {
  getSemanticTypeIcon,
  getSemanticTypeName,
} from "metabase/common/utils/fields";

import {
  Label,
  LabelContainer,
  RelativeSizeIcon,
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
      <RelativeSizeIcon name={semanticTypeIcon} />
      <Label>{semanticTypeName}</Label>
    </LabelContainer>
  );
}
