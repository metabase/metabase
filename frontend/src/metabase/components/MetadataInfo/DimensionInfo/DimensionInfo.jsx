import React, { useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";

import Dimension from "metabase-lib/lib/Dimension";
import DimensionLabel from "metabase/components/MetadataInfo/DimensionLabel";
import FieldFingerprintInfo from "metabase/components/MetadataInfo/FieldFingerprintInfo";
import { useAsyncFunction } from "metabase/hooks/use-async-function";
import Fields from "metabase/entities/fields";

import {
  InfoContainer,
  Description,
  EmptyDescription,
} from "../MetadataInfo.styled";

DimensionInfo.propTypes = {
  className: PropTypes.string,
  dimension: PropTypes.instanceOf(Dimension).isRequired,
  fieldValues: PropTypes.array,
  fetchFieldValues: PropTypes.func.isRequired,
};

const mapStateToProps = (state, props) => {
  const fieldId = props.dimension.field()?.id;
  return {
    fieldValues:
      fieldId != null
        ? Fields.selectors.getFieldValues(state, {
            entityId: fieldId,
          })
        : [],
  };
};

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

export function DimensionInfo({
  className,
  dimension,
  fieldValues = [],
  fetchFieldValues,
}) {
  const field = useMemo(() => dimension.field(), [dimension]);
  const description = field?.description;
  const [isReady, setIsReady] = React.useState(false);

  const safeFetchFieldValues = useAsyncFunction(fetchFieldValues);

  useEffect(() => {
    const isCategoryField = field?.isCategory();
    const listsFieldValues = field?.has_field_values === "list";
    const isMissingFieldValues = fieldValues.length === 0;

    if (isCategoryField && listsFieldValues && isMissingFieldValues) {
      safeFetchFieldValues({ id: field.id }).then(() => setIsReady(true));
    } else {
      setIsReady(true);
    }
  }, [field, fieldValues, fieldValues.length, safeFetchFieldValues]);

  return isReady ? (
    <InfoContainer className={className}>
      {description ? (
        <Description>{description}</Description>
      ) : (
        <EmptyDescription>{t`No description`}</EmptyDescription>
      )}
      <DimensionLabel dimension={dimension} />
      <FieldFingerprintInfo
        field={dimension.field()}
        fieldValues={fieldValues}
      />
    </InfoContainer>
  ) : null;
}

export default connect(mapStateToProps, mapDispatchToProps)(DimensionInfo);
