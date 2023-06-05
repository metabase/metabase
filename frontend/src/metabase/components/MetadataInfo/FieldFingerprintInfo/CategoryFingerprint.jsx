import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t, ngettext, msgid } from "ttag";

import { useSafeAsyncFunction } from "metabase/hooks/use-safe-async-function";
import Fields from "metabase/entities/fields";
import { formatNumber } from "metabase/lib/formatting";
import Field from "metabase-lib/metadata/Field";

import {
  NoWrap,
  LoadingSpinner,
  RelativeContainer,
  Fade,
  FadeAndSlide,
  Container,
  Li,
} from "./CategoryFingerprint.styled";

const propTypes = {
  className: PropTypes.string,
  field: PropTypes.instanceOf(Field).isRequired,
  fieldValues: PropTypes.array,
  fetchFieldValues: PropTypes.func.isRequired,
  showAllFieldValues: PropTypes.bool,
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
  className,
  field,
  fieldValues = [],
  fetchFieldValues,
  showAllFieldValues,
}) {
  const fieldId = field.id;
  const listsFieldValues = field.has_field_values === "list";
  const isMissingFieldValues = fieldValues.length === 0;
  const shouldFetchFieldValues = listsFieldValues && isMissingFieldValues;

  const distinctCount = field.fingerprint?.global?.["distinct-count"];
  const formattedDistinctCount = formatNumber(distinctCount);

  const [isLoading, setIsLoading] = useState(shouldFetchFieldValues);
  const safeFetchFieldValues = useSafeAsyncFunction(fetchFieldValues);
  useEffect(() => {
    if (shouldFetchFieldValues) {
      setIsLoading(true);
      safeFetchFieldValues({ id: fieldId }).finally(() => {
        setIsLoading(false);
      });
    }
  }, [fieldId, shouldFetchFieldValues, safeFetchFieldValues]);

  const showDistinctCount = isLoading || distinctCount != null;
  const showFieldValuesBlock = isLoading || fieldValues.length > 0;
  const showComponent = showDistinctCount || showFieldValuesBlock;

  return showComponent ? (
    <Container className={className}>
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
      {showFieldValuesBlock &&
        (showAllFieldValues ? (
          <ExtendedFieldValuesList fieldValues={fieldValues} />
        ) : (
          <ShortenedFieldValuesList
            isLoading={isLoading}
            fieldValues={fieldValues}
          />
        ))}
    </Container>
  ) : null;
}

ExtendedFieldValuesList.propTypes = {
  fieldValues: PropTypes.array.isRequired,
};

function ExtendedFieldValuesList({ fieldValues }) {
  return (
    <ul>
      {fieldValues.map((fieldValue, i) => {
        const value = Array.isArray(fieldValue) ? fieldValue[0] : fieldValue;
        return <Li key={i}>{value}</Li>;
      })}
    </ul>
  );
}

ShortenedFieldValuesList.propTypes = {
  isLoading: PropTypes.bool.isRequired,
  fieldValues: PropTypes.array.isRequired,
};

function ShortenedFieldValuesList({ isLoading, fieldValues }) {
  const shortenedValuesStr = fieldValues
    .slice(0, FIELD_VALUES_SHOW_LIMIT)
    .map(value => (Array.isArray(value) ? value[0] : value))
    .join(", ");

  return (
    <RelativeContainer height={isLoading ? "1.8em" : "1.5em"}>
      <Fade visible={isLoading}>
        <LoadingSpinner />
      </Fade>
      <FadeAndSlide visible={!isLoading}>
        <NoWrap>{shortenedValuesStr}</NoWrap>
      </FadeAndSlide>
    </RelativeContainer>
  );
}

CategoryFingerprint.propTypes = propTypes;

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(CategoryFingerprint);
