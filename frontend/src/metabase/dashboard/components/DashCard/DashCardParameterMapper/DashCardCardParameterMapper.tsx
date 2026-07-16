import { useMemo } from "react";
import { t } from "ttag";

import { isActionDashCard } from "metabase/actions/utils";
import { skipToken } from "metabase/api";
import { useListMetricDimensionsQuery } from "metabase/api/metric";
import {
  getDashcardParameterMappingOptions,
  getEditingParameter,
  getEditingParameterInlineDashcard,
  getParameterTarget,
  getQuestionByCard,
} from "metabase/dashboard/selectors";
import { isNativeDashCard } from "metabase/dashboard/utils";
import {
  type ParameterMappingOption,
  getMappingOptionByTarget,
} from "metabase/parameters/utils/mapping-options";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getIsRecentlyAutoConnectedDashcard } from "metabase/redux/undo";
import { Box, Flex, Icon, Text, Transition } from "metabase/ui";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import { getMobileHeight } from "metabase/visualizations/shared/utils/sizes";
import type Question from "metabase-lib/v1/Question";
import { isDateParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import { isParameterVariableTarget } from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  DashboardCard,
  MetricDimension,
  Parameter,
  ParameterTarget,
  VirtualCard,
} from "metabase-types/api";
import { isStructuredDimensionTarget } from "metabase-types/guards";

import { DashCardCardParameterMapperContent } from "./DashCardCardParameterMapperContent";
import S from "./DashCardParameterMapper.module.css";

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
    editingParameterInlineDashcard: getEditingParameterInlineDashcard(state),
    isRecentlyAutoConnected: getIsRecentlyAutoConnectedDashcard(
      state,
      props,
      editingParameter?.id,
    ),
  };
};

interface DashcardCardParameterMapperProps {
  card: Card | VirtualCard;
  dashcard: DashboardCard;
  editingParameter?: Parameter | null | undefined;
  target?: ParameterTarget | null | undefined;
  isMobile: boolean;
  // virtual cards will not have question
  question?: Question;
  mappingOptions?: ParameterMappingOption[];
  isRecentlyAutoConnected?: boolean;
  editingParameterInlineDashcard?: DashboardCard;
  compact?: boolean;
}

export function DashCardCardParameterMapper({
  card,
  dashcard,
  editingParameter,
  target,
  isMobile,
  question,
  mappingOptions = [],
  isRecentlyAutoConnected = false,
  editingParameterInlineDashcard,
  compact,
}: DashcardCardParameterMapperProps) {
  const metricId = card.type === "metric" ? card.id : undefined;
  const isMetric = metricId != null;
  const { data: metricDimensionsData } = useListMetricDimensionsQuery(
    isMetric ? { metricId } : skipToken,
  );
  const visibleMappingOptions = useMemo(() => {
    return isMetric
      ? getMetricMappingOptions(
          mappingOptions,
          metricDimensionsData?.added ?? [],
        )
      : mappingOptions;
  }, [isMetric, mappingOptions, metricDimensionsData?.added]);
  const isQuestion = isQuestionDashCard(dashcard);
  const hasSeries = isQuestion && dashcard.series && dashcard.series.length > 0;
  const isAction = isActionDashCard(dashcard);
  const isDisabled = visibleMappingOptions.length === 0 || isAction;
  const isNative = isQuestion && isNativeDashCard(dashcard);

  const selectedMappingOption = getMappingOptionByTarget(
    visibleMappingOptions,
    target,
    question,
    editingParameter ?? undefined,
  );

  const layoutHeight = isMobile
    ? getMobileHeight(dashcard.card.display, dashcard.size_y)
    : dashcard.size_y;

  const shouldShowAutoConnectHint =
    isRecentlyAutoConnected && !!selectedMappingOption;

  const additionalActionParametersContent =
    target && isParameterVariableTarget(target) && isAction
      ? editingParameter && isDateParameter(editingParameter) // Date parameters types that can be wired to variables can only take a single value anyway, so don't explain it in the warning.
        ? t`Action parameters do not support dropdown lists or search box filters, and can't limit values for linked filters.`
        : t`Action parameters only accept a single value. They do not support dropdown lists or search box filters, and can't limit values for linked filters.`
      : undefined;

  const shouldShowActionParametersWarningInTooltip =
    isMobile || dashcard.size_y * dashcard.size_x <= 30 || dashcard.size_x < 4;

  return (
    <Flex
      direction="column"
      align="center"
      w="100%"
      pos="relative"
      my={!isMobile && dashcard.size_y < 2 ? "0" : "0.5rem"}
      py="lg"
    >
      {hasSeries && (
        <Box maw="100px" mb="sm" fz="0.83em" className={S.CardLabel}>
          {card.name}
        </Box>
      )}
      <DashCardCardParameterMapperContent
        isNative={isNative}
        isDisabled={isDisabled}
        isMobile={isMobile}
        dashcard={dashcard}
        question={question}
        editingParameter={editingParameter}
        mappingOptions={visibleMappingOptions}
        isQuestion={isQuestion}
        editingParameterInlineDashcard={editingParameterInlineDashcard}
        card={card}
        selectedMappingOption={selectedMappingOption}
        target={target}
        shouldShowAutoConnectHint={shouldShowAutoConnectHint}
        layoutHeight={layoutHeight}
        compact={compact}
        additionalActionParametersContent={
          (shouldShowActionParametersWarningInTooltip &&
            additionalActionParametersContent) ||
          undefined
        }
      />
      <Transition
        mounted={shouldShowAutoConnectHint && layoutHeight > 3}
        transition="fade"
        duration={400}
        exitDuration={0}
      >
        {(styles) => {
          /* bottom prop is negative as we wanted to keep layout not shifted on hint */
          return (
            <Flex
              mt="sm"
              align="center"
              pos="absolute"
              bottom={0}
              style={styles}
            >
              <Icon name="sparkles" size="16" />
              <Text
                component="span"
                ml="xs"
                fw="bold"
                fz="sm"
                lh={1}
                color="text-disabled"
              >{t`Auto-connected`}</Text>
            </Flex>
          );
        }}
      </Transition>
      {additionalActionParametersContent &&
        !shouldShowActionParametersWarningInTooltip && (
          <span className={S.Warning}>{additionalActionParametersContent}</span>
        )}
    </Flex>
  );
}

function getMetricMappingOptions(
  mappingOptions: ParameterMappingOption[],
  dimensions: MetricDimension[],
): ParameterMappingOption[] {
  return dimensions.flatMap((dimension) => {
    const fieldIds = new Set(
      dimension.sources?.map((source) => source["field-id"]),
    );
    const mappingOption = mappingOptions.find((option) => {
      if (!isStructuredDimensionTarget(option.target)) {
        return false;
      }

      const fieldReference = option.target[1];
      return (
        fieldReference[0] === "field" &&
        typeof fieldReference[1] === "number" &&
        fieldIds.has(fieldReference[1])
      );
    });

    if (!mappingOption) {
      return [];
    }

    return [
      {
        name: dimension.display_name,
        icon: mappingOption.icon,
        isForeign: false,
        target: mappingOption.target,
      },
    ];
  });
}

export const DashCardCardParameterMapperConnected = connect(mapStateToProps)(
  DashCardCardParameterMapper,
);
