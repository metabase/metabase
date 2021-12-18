import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t, ngettext, msgid } from "ttag";

import { useAsyncFunction } from "metabase/hooks/use-async-function";
import Field from "metabase-lib/lib/metadata/Field";
import Fields from "metabase/entities/fields";
import { formatNumber } from "metabase/lib/formatting";

import {
  NoWrap,
  LoadingSpinner,
  RelativeContainer,
  Fade,
  FadeAndSlide,
  Container,
} from "./CategoryFingerprint.styled";

const propTypes = {
  field: PropTypes.instanceOf(Field).isRequired,
  fieldValues: PropTypes.array.isRequired,
  fetchFieldValues: PropTypes.func.isRequired,
};

const FIELD_VALUES_SHOW_LIMIT = 35;

const mapStateToProps = (state, props) => {
  const fieldId = props.field.id;
  const fieldValues =
    fieldId != null
      ? Fields.selectors.getFieldValues(state, {
          entityId: fieldId,
        })
      : [];
  return {
    fieldValues: fieldValues || [],
  };
};

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

export function CategoryFingerprint({
  field,
  fieldValues = [],
  fetchFieldValues,
}) {
  const fieldId = field.id;
  const listsFieldValues = field.has_field_values === "list";
  const isMissingFieldValues = fieldValues.length === 0;
  const shouldFetchFieldValues = listsFieldValues && isMissingFieldValues;

  const shortenedValuesStr = fieldValues
    .slice(0, FIELD_VALUES_SHOW_LIMIT)
    .map(value => (Array.isArray(value) ? value[0] : value))
    .join(", ");

  const distinctCount = field.fingerprint?.global?.["distinct-count"];
  const formattedDistinctCount = formatNumber(distinctCount);

  const [isLoading, setIsLoading] = useState(shouldFetchFieldValues);
  const safeFetchFieldValues = useAsyncFunction(fetchFieldValues);
  useEffect(() => {
    if (shouldFetchFieldValues) {
      setIsLoading(true);
      safeFetchFieldValues({ id: fieldId }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [fieldId, shouldFetchFieldValues, safeFetchFieldValues]);

  const showDistinctCount = isLoading || distinctCount != null;
  const showFieldValuesBlock = isLoading || shortenedValuesStr.length > 0;
  const showComponent = showDistinctCount || showFieldValuesBlock;

  return showComponent ? (
    <Container>
      {showDistinctCount && (
        <RelativeContainer>
          <Fade aria-hidden={!isLoading} visible={!isLoading}>
            {ngettext(
              msgid`${formattedDistinctCount} distinct value`,
              `${formattedDistinctCount} distinct values`,
              distinctCount || 0,
            )}
          </Fade>
          <Fade
            aria-hidden={!isLoading}
            visible={isLoading}
          >{t`Getting distinct values...`}</Fade>
        </RelativeContainer>
      )}
      {showFieldValuesBlock && (
        <RelativeContainer height={isLoading ? "1.8em" : "1.25em"}>
          <Fade visible={isLoading}>
            <LoadingSpinner />
          </Fade>
          <FadeAndSlide visible={!isLoading}>
            <NoWrap>{shortenedValuesStr}</NoWrap>
          </FadeAndSlide>
        </RelativeContainer>
      )}
    </Container>
  ) : null;
}

CategoryFingerprint.propTypes = propTypes;

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(CategoryFingerprint);
