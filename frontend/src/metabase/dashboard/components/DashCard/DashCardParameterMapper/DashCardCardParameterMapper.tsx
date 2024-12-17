import { t } from "ttag";

import { isActionDashCard } from "metabase/actions/utils";
import {
  getDashcardParameterMappingOptions,
  getEditingParameter,
  getParameterTarget,
  getQuestionByCard,
} from "metabase/dashboard/selectors";
import { isNativeDashCard, isQuestionDashCard } from "metabase/dashboard/utils";
import { connect } from "metabase/lib/redux";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import { getIsRecentlyAutoConnectedDashcard } from "metabase/redux/undo";
import { Flex, Icon, Text, Transition } from "metabase/ui";
import {
  MOBILE_DEFAULT_CARD_HEIGHT,
  MOBILE_HEIGHT_BY_DISPLAY_TYPE,
} from "metabase/visualizations/shared/utils/sizes";
import type Question from "metabase-lib/v1/Question";
import { isDateParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import { isParameterVariableTarget } from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  DashboardCard,
  Parameter,
  ParameterTarget,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { getMappingOptionByTarget } from "../utils";

import {
  CardLabel,
  Container,
  Warning,
} from "./DashCardCardParameterMapper.styled";
import { DashCardCardParameterMapperContent } from "./DashCardCardParameterMapperContent";
import { useResetParameterMapping } from "./hooks";

const mapStateToProps = (
  state: State,
  props: DashcardCardParameterMapperProps,
) => {
  const editingParameter = getEditingParameter(state);

  return {
    editingParameter,
    target: getParameterTarget(state, props),
    question: getQuestionByCard(state, props),
    mappingOptions: getDashcardParameterMappingOptions(state, props),
    isRecentlyAutoConnected: getIsRecentlyAutoConnectedDashcard(
      state,
      props,
      editingParameter?.id,
    ),
  };
};

interface DashcardCardParameterMapperProps {
  card: Card;
  dashcard: DashboardCard;
  editingParameter: Parameter | null | undefined;
  target: ParameterTarget | null | undefined;
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
  isMobile,
  question,
  mappingOptions,
  isRecentlyAutoConnected,
}: DashcardCardParameterMapperProps) {
  const isQuestion = isQuestionDashCard(dashcard);
  const hasSeries = isQuestion && dashcard.series && dashcard.series.length > 0;
  const isDisabled = mappingOptions.length === 0 || isActionDashCard(dashcard);
  const isNative = isQuestion && isNativeDashCard(dashcard);

  useResetParameterMapping({
    editingParameter,
    isNative,
    dashcardId: dashcard.id,
  });

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

  const shouldShowAutoConnectHint =
    isRecentlyAutoConnected && !!selectedMappingOption;

  return (
    <Container isSmall={!isMobile && dashcard.size_y < 2}>
      {hasSeries && <CardLabel>{card.name}</CardLabel>}
      <DashCardCardParameterMapperContent
        isNative={isNative}
        isDisabled={isDisabled}
        isMobile={isMobile}
        dashcard={dashcard}
        question={question}
        editingParameter={editingParameter}
        mappingOptions={mappingOptions}
        isQuestion={isQuestion}
        card={card}
        selectedMappingOption={selectedMappingOption}
        target={target}
        shouldShowAutoConnectHint={shouldShowAutoConnectHint}
        layoutHeight={layoutHeight}
      />
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

export const DashCardCardParameterMapperConnected = connect(mapStateToProps)(
  DashCardCardParameterMapper,
);
