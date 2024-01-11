import PropTypes from "prop-types";
import { t } from "ttag";

import {
  getSemanticTypeIcon,
  getSemanticTypeName,
} from "metabase/lib/schema_metadata";
import Field from "metabase-lib/metadata/Field";

import {
  LabelContainer,
  Label,
  InvertedColorRelativeSizeIcon,
} from "../MetadataInfo.styled";

FieldSemanticTypeLabel.propTypes = {
  className: PropTypes.string,
  field: PropTypes.instanceOf(Field).isRequired,
};

type Props = {
  className?: string;
  field: Field;
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
