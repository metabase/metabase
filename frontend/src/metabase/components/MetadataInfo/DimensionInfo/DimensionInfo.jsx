import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Dimension from "metabase-lib/lib/Dimension";
import DimensionLabel from "metabase/components/MetadataInfo/DimensionLabel";
import FieldFingerprintInfo from "metabase/components/MetadataInfo/FieldFingerprintInfo";

import {
  InfoContainer,
  Description,
  EmptyDescription,
} from "../MetadataInfo.styled";

DimensionInfo.propTypes = {
  className: PropTypes.string,
  dimension: PropTypes.instanceOf(Dimension).isRequired,
};

export function DimensionInfo({ className, dimension }) {
  const field = useMemo(() => dimension.field(), [dimension]);
  const description = field?.description;
  return (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <DimensionLabel dimension={dimension} />
      <FieldFingerprintInfo field={field} />
    </InfoContainer>
  );
}

export default DimensionInfo;
