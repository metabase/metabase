import { t } from "ttag";

import {
  getSemanticTypeIcon,
  getSemanticTypeName,
} from "metabase/lib/schema_metadata";
import type { DatasetColumn } from "metabase-types/api";
import type Field from "metabase-lib/metadata/Field";

import {
  LabelContainer,
  Label,
  InvertedColorRelativeSizeIcon,
} from "../MetadataInfo.styled";

type Props = {
  className?: string;
  field: Field | DatasetColumn;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function FieldSemanticTypeLabel({ className, field }: Props) {
  const semanticType = field.semantic_type;
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
