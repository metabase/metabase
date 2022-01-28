import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Dimension from "metabase-lib/lib/Dimension";

import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
  DimensionSemanticTypeLabel,
  FieldFingerprintInfo,
} from "./DimensionInfo.styled";

DimensionInfo.propTypes = {
  className: PropTypes.string,
  dimension: PropTypes.instanceOf(Dimension).isRequired,
};

export function DimensionInfo({ className, dimension }) {
  const field = dimension.field();
  const description = field?.description;
  return (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <DimensionSemanticTypeLabel dimension={dimension} />
      <FieldFingerprintInfo field={field} />
    </InfoContainer>
  );
}

export default DimensionInfo;
