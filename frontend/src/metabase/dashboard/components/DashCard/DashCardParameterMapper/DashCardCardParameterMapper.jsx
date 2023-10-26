import { useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";

import MetabaseSettings from "metabase/lib/settings";
import { getMetadata } from "metabase/selectors/metadata";

import {
  getNativeDashCardEmptyMappingText,
  isNativeDashCard,
  isVirtualDashCard,
  getVirtualCardType,
  showVirtualDashCardInfoText,
} from "metabase/dashboard/utils";

import { isActionDashCard } from "metabase/actions/utils";
import {
  getEditingParameter,
  getParameterTarget,
  getParameterMappingOptions,
  getDashcards,
} from "metabase/dashboard/selectors";
import { getParameterMappingOptions as getDashcardParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { DashCardCardParameterMapperButton } from "metabase/dashboard/components/DashCard/DashCardParameterMapperButton/DashCardCardParameterMapperButton";
import { setParameterMapping } from "metabase/dashboard/actions";
import {
  compareMappingOptionTargets,
  isVariableTarget,
} from "metabase-lib/parameters/utils/targets";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";

import {
  Container,
  CardLabel,
  TextCardDefault,
  Warning,
  NativeCardDefault,
  NativeCardIcon,
  NativeCardText,
  NativeCardLink,
} from "./DashCardCardParameterMapper.styled";

function findMatchingMappedOption({
  dashcardMappingOptions,
  target,
  metadata,
}) {
  return dashcardMappingOptions
    .map(mappingOption => mappingOption.target)
    .find(mappingOptionTarget =>
      compareMappingOptionTargets(mappingOptionTarget, target, metadata),
    );
}

const mapStateToProps = (state, props) => ({
  editingParameter: getEditingParameter(state, props),
  target: getParameterTarget(state, props),
  mappingOptions: getParameterMappingOptions(state, props),
  metadata: getMetadata(state),
  dashcards: getDashcards(state),
});

const mapDispatchToProps = {
  setParameterMapping,
};

DashCardCardParameterMapper.propTypes = {
  card: PropTypes.object.isRequired,
  dashcard: PropTypes.object.isRequired,
  editingParameter: PropTypes.object.isRequired,
  target: PropTypes.object,
  mappingOptions: PropTypes.array.isRequired,
  metadata: PropTypes.object.isRequired,
  setParameterMapping: PropTypes.func.isRequired,
  isMobile: PropTypes.bool,
  dashcards: PropTypes.object.isRequired,
};

export function DashCardCardParameterMapper({
  card,
  dashcard,
  editingParameter,
  target,
  mappingOptions,
  metadata,
  setParameterMapping,
  isMobile,
  dashcards,
}) {
  const hasSeries = dashcard.series && dashcard.series.length > 0;
  const isDisabled = mappingOptions.length === 0 || isActionDashCard(dashcard);

  const availableCardsWithoutEditingParameter = useMemo(
    () =>
      Object.values(dashcards).filter(
        dashcard =>
          !dashcard.parameter_mappings?.some(
            mapping => mapping.parameter_id === editingParameter.id,
          ),
      ),
    [dashcards, editingParameter.id],
  );

  const setParameterMappingsForMatchingCards = useCallback(
    target => {
      for (const otherDashcard of availableCardsWithoutEditingParameter) {
        const otherDashcardMappingOptions = getDashcardParameterMappingOptions(
          metadata,
          null,
          otherDashcard.card,
        );

        const matchingMappedOption = findMatchingMappedOption({
          dashcardMappingOptions: otherDashcardMappingOptions,
          target,
          metadata,
        });

        if (matchingMappedOption) {
          setParameterMapping(
            editingParameter.id,
            otherDashcard.id,
            otherDashcard.card.id,
            matchingMappedOption,
          );
        }
      }
    },
    [
      availableCardsWithoutEditingParameter,
      editingParameter.id,
      metadata,
      setParameterMapping,
    ],
  );

  const handleChangeTarget = useCallback(
    target => {
      if (target) {
        setParameterMappingsForMatchingCards(target);
      }
      setParameterMapping(editingParameter.id, dashcard.id, card.id, target);
    },
    [
      card.id,
      dashcard.id,
      editingParameter.id,
      setParameterMapping,
      setParameterMappingsForMatchingCards,
    ],
  );

  const isVirtual = isVirtualDashCard(dashcard);
  const virtualCardType = getVirtualCardType(dashcard);
  const isNative = isNativeDashCard(dashcard);

  const mappingInfoText =
    {
      heading: t`You can connect widgets to {{variables}} in heading cards.`,
      text: t`You can connect widgets to {{variables}} in text cards.`,
      link: t`You cannot connect variables to link cards.`,
      action: t`Open this card's action settings to connect variables`,
    }[virtualCardType] ?? "";

  return (
    <Container isSmall={!isMobile && dashcard.size_y < 2}>
      {hasSeries && <CardLabel>{card.name}</CardLabel>}
      {isVirtual && isDisabled ? (
        showVirtualDashCardInfoText(dashcard, isMobile) ? (
          <TextCardDefault>
            <Icon name="info" size={12} className="pr1" />
            {mappingInfoText}
          </TextCardDefault>
        ) : (
          <TextCardDefault aria-label={mappingInfoText}>
            <Icon
              name="info"
              size={16}
              className="text-dark-hover"
              tooltip={mappingInfoText}
            />
          </TextCardDefault>
        )
      ) : isNative && isDisabled ? (
        <NativeCardDefault>
          <NativeCardIcon name="info" />
          <NativeCardText>
            {getNativeDashCardEmptyMappingText(editingParameter)}
          </NativeCardText>
          <NativeCardLink
            href={MetabaseSettings.docsUrl(
              "questions/native-editor/sql-parameters",
            )}
          >{t`Learn how`}</NativeCardLink>
        </NativeCardDefault>
      ) : (
        <DashCardCardParameterMapperButton
          dashcard={dashcard}
          card={card}
          isDisabled={isDisabled}
          isMobile={isMobile}
          target={target}
          handleChangeTarget={handleChangeTarget}
        />
      )}
      {isVariableTarget(target) && (
        <Warning>
          {isDateParameter(editingParameter) // Date parameters types that can be wired to variables can only take a single value anyway, so don't explain it in the warning.
            ? t`Native question variables do not support dropdown lists or search box filters, and can't limit values for linked filters.`
            : t`Native question variables only accept a single value. They do not support dropdown lists or search box filters, and can't limit values for linked filters.`}
        </Warning>
      )}
    </Container>
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashCardCardParameterMapper);
