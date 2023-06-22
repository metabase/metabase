import PropTypes from "prop-types";
import { t } from "ttag";

import Dimension from "metabase-lib/Dimension";

import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
  DimensionSemanticTypeLabel,
  FieldFingerprintInfo,
} from "./DimensionInfo.styled";

DimensionInfo.propTypes = {
  className: PropTypes.string,
  dimension: PropTypes.instanceOf(Dimension).isRequired,
  showAllFieldValues: PropTypes.bool,
};

export function DimensionInfo({ className, dimension, showAllFieldValues }) {
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
      <FieldFingerprintInfo
        field={field}
        showAllFieldValues={showAllFieldValues}
      />
    </InfoContainer>
  );
}

export default DimensionInfo;
