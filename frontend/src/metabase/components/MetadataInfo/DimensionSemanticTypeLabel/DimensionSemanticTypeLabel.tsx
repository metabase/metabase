import PropTypes from "prop-types";
import { t } from "ttag";

import {
  getSemanticTypeIcon,
  getSemanticTypeName,
} from "metabase/lib/schema_metadata";
import Dimension from "metabase-lib/Dimension";

import {
  LabelContainer,
  Label,
  InvertedColorRelativeSizeIcon,
} from "../MetadataInfo.styled";

DimensionSemanticTypeLabel.propTypes = {
  className: PropTypes.string,
  dimension: PropTypes.instanceOf(Dimension).isRequired,
};

type Props = {
  className?: string;
  dimension: Dimension;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function DimensionSemanticTypeLabel({
  className,
  dimension,
}: Props) {
  const field = dimension.field();
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
