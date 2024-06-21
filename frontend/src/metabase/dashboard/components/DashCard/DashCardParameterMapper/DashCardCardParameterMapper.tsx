import { useState, useMemo, useCallback } from "react";
import { connect } from "react-redux";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { isActionDashCard } from "metabase/actions/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { setParameterMapping } from "metabase/dashboard/actions/parameters";
import {
  getEditingParameter,
  getDashcardParameterMappingOptions,
  getParameterTarget,
  getQuestionByCard,
} from "metabase/dashboard/selectors";
import {
  isNativeDashCard,
  isVirtualDashCard,
  getVirtualCardType,
  showVirtualDashCardInfoText,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import { getIsRecentlyAutoConnectedDashcard } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex, Icon, Text, Transition, Tooltip, Box } from "metabase/ui";
import {
  MOBILE_HEIGHT_BY_DISPLAY_TYPE,
  MOBILE_DEFAULT_CARD_HEIGHT,
} from "metabase/visualizations/shared/utils/sizes";
import type Question from "metabase-lib/v1/Question";
import {
  isDateParameter,
  isTemporalUnitParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import { isParameterVariableTarget } from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  CardId,
  DashCardId,
  DashboardCard,
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { getMappingOptionByTarget } from "../utils";

import {
  Container,
  CardLabel,
  Header,
  TextCardDefault,
  Warning,
} from "./DashCardCardParameterMapper.styled";
import { DashCardCardParameterMapperButton } from "./DashCardCardParameterMapperButton";
import { DisabledNativeCardHelpText } from "./DisabledNativeCardHelpText";
import { useResetParameterMapping } from "./hooks";

const mapStateToProps = (
  state: State,
  props: DashcardCardParameterMapperProps,
) => {
  const editingParameter = getEditingParameter(state);

  return {
    editingParameter,
    target: getParameterTarget(state, props),
    metadata: getMetadata(state),
    question: getQuestionByCard(state, props),
    mappingOptions: getDashcardParameterMappingOptions(state, props),
    isRecentlyAutoConnected: getIsRecentlyAutoConnectedDashcard(
      state,
      // @ts-expect-error redux/undo is not in TS
      props,
      editingParameter?.id,
    ),
  };
};

const mapDispatchToProps = {
  setParameterMapping,
};

interface DashcardCardParameterMapperProps {
  card: Card;
  dashcard: DashboardCard;
  editingParameter: Parameter | null | undefined;
  target: ParameterTarget | null | undefined;
  setParameterMapping: (
    parameterId: ParameterId,
    dashcardId: DashCardId,
    cardId: CardId,
    target: ParameterTarget | null,
  ) => void;
  isMobile: boolean;
  // virtual cards will not have question
  question?: Question;
  mappingOptions: ParameterMappingOption[];
  isRecentlyAutoConnected: boolean;
}

export function DashCardCardParameterMapper({
  card,
  dashcard,
  editingParameter,
  target,
  setParameterMapping,
  isMobile,
  question,
  mappingOptions,
  isRecentlyAutoConnected,
}: DashcardCardParameterMapperProps) {
  const isQuestion = isQuestionDashCard(dashcard);
  const hasSeries = isQuestion && dashcard.series && dashcard.series.length > 0;
  const isDisabled = mappingOptions.length === 0 || isActionDashCard(dashcard);
  const isVirtual = isVirtualDashCard(dashcard);
  const virtualCardType = getVirtualCardType(dashcard);
  const isNative = isQuestion && isNativeDashCard(dashcard);
  const isTemporalUnit =
    editingParameter != null && isTemporalUnitParameter(editingParameter);

  useResetParameterMapping({
    editingParameter,
    isNative,
    isDisabled,
    dashcardId: dashcard.id,
  });

  const handleChangeTarget = useCallback(
    (target: ParameterTarget | null) => {
      if (editingParameter) {
        setParameterMapping(editingParameter.id, dashcard.id, card.id, target);
      }
    },
    [card.id, dashcard.id, editingParameter, setParameterMapping],
  );

  const selectedMappingOption = getMappingOptionByTarget(
    mappingOptions,
    dashcard,
    target,
    question,
    editingParameter ?? undefined,
  );

  const layoutHeight = isMobile
    ? MOBILE_HEIGHT_BY_DISPLAY_TYPE[dashcard.card.display] ||
      MOBILE_DEFAULT_CARD_HEIGHT
    : dashcard.size_y;

  const headerContent = useMemo(() => {
    if (layoutHeight > 2) {
      if (isTemporalUnit) {
        return t`Connect to`;
      }
      if (!isVirtual && !(isNative && isDisabled)) {
        return t`Column to filter on`;
      }
      return t`Variable to map to`;
    }
    return null;
  }, [layoutHeight, isTemporalUnit, isVirtual, isNative, isDisabled]);

  const mappingInfoText =
    (virtualCardType &&
      {
        heading: t`You can connect widgets to {{variables}} in heading cards.`,
        text: t`You can connect widgets to {{variables}} in text cards.`,
        link: t`You cannot connect variables to link cards.`,
        action: t`Open this card's action settings to connect variables`,
        placeholder: "",
      }[virtualCardType]) ??
    "";

  const shouldShowAutoConnectHint =
    isRecentlyAutoConnected && !!selectedMappingOption;

  return (
    <Container isSmall={!isMobile && dashcard.size_y < 2}>
      {hasSeries && <CardLabel>{card.name}</CardLabel>}
      {isVirtual && isDisabled ? (
        showVirtualDashCardInfoText(dashcard, isMobile) ? (
          <TextCardDefault>
            <Icon name="info" size={12} className={CS.pr1} />
            {mappingInfoText}
          </TextCardDefault>
        ) : (
          <TextCardDefault aria-label={mappingInfoText}>
            <Icon
              name="info"
              size={16}
              className={CS.textDarkHover}
              tooltip={mappingInfoText}
            />
          </TextCardDefault>
        )
      ) : isNative && isDisabled && question && editingParameter ? (
        <DisabledNativeCardHelpText
          question={question}
          parameter={editingParameter}
        />
      ) : (
        <>
          {headerContent && (
            <Header>
              <Ellipsified>{headerContent}</Ellipsified>
            </Header>
          )}
          <Flex align="center" justify="center" gap="xs" pos="relative">
            <DashCardCardParameterMapperButton
              handleChangeTarget={handleChangeTarget}
              isVirtual={isVirtual}
              isQuestion={isQuestion}
              isDisabled={isDisabled}
              selectedMappingOption={selectedMappingOption}
              question={question}
              card={card}
              target={target}
              mappingOptions={mappingOptions}
            />
            {shouldShowAutoConnectHint &&
              layoutHeight <= 3 &&
              dashcard.size_x > 4 && <AutoConnectedAnimatedIcon />}
          </Flex>
        </>
      )}
      <Transition
        mounted={shouldShowAutoConnectHint && layoutHeight > 3}
        transition="fade"
        duration={400}
        exitDuration={0}
      >
        {styles => {
          /* bottom prop is negative as we wanted to keep layout not shifted on hint */
          return (
            <Flex
              mt="sm"
              align="center"
              pos="absolute"
              bottom={-20}
              style={styles}
            >
              <Icon name="sparkles" size="16" />
              <Text
                component="span"
                ml="xs"
                weight="bold"
                fz="sm"
                lh={1}
                color="text-light"
              >{t`Auto-connected`}</Text>
            </Flex>
          );
        }}
      </Transition>
      {target && isParameterVariableTarget(target) && (
        <Warning>
          {editingParameter && isDateParameter(editingParameter) // Date parameters types that can be wired to variables can only take a single value anyway, so don't explain it in the warning.
            ? t`Native question variables do not support dropdown lists or search box filters, and can't limit values for linked filters.`
            : t`Native question variables only accept a single value. They do not support dropdown lists or search box filters, and can't limit values for linked filters.`}
        </Warning>
      )}
    </Container>
  );
}

function AutoConnectedAnimatedIcon() {
  const [mounted, setMounted] = useState(false);

  useMount(() => {
    setMounted(true);
  });

  return (
    <Transition transition="fade" mounted={mounted} exitDuration={0}>
      {styles => {
        return (
          <Box component="span" style={styles} pos="absolute" right={-20}>
            <Tooltip label={t`Auto-connected`}>
              <Icon name="sparkles" />
            </Tooltip>
          </Box>
        );
      }}
    </Transition>
  );
}

export const DashCardCardParameterMapperConnected = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashCardCardParameterMapper);
