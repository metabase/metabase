import PropTypes from "prop-types";
import { t } from "ttag";
import Field from "metabase-lib/metadata/Field";
import { Description, EmptyDescription } from "../MetadataInfo.styled";
import {
  InfoContainer,
  FieldSemanticTypeLabel,
  FieldFingerprintInfo,
} from "./FieldInfo.styled";

FieldInfo.propTypes = {
  className: PropTypes.string,
  field: PropTypes.instanceOf(Field),
  showAllFieldValues: PropTypes.bool,
};

export function FieldInfo({ className, field, showAllFieldValues }) {
  const description = field?.description;
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

export default FieldInfo;
