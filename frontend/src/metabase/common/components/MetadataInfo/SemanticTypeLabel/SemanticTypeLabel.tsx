import { t } from "ttag";

import {
  getSemanticTypeIcon,
  getSemanticTypeName,
} from "metabase/common/utils/fields";
import { Icon } from "metabase/ui";

import { Label, LabelContainer } from "../MetadataInfo";

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
    <LabelContainer className={className} c="core-brand">
      <Icon name={semanticTypeIcon} size={12} />
      <Label>{semanticTypeName}</Label>
    </LabelContainer>
  );
}
