import classNames from "classnames";
import { useCallback, useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { setParameterMapping } from "metabase/dashboard/actions/parameters";
import {
  getVirtualCardType,
  isQuestionDashCard,
  isVirtualDashCard,
  showVirtualDashCardInfoText,
} from "metabase/dashboard/utils";
import { useDispatch } from "metabase/lib/redux";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import {
  Box,
  Flex,
  Icon,
  Stack,
  Title,
  Tooltip,
  Transition,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import { isTemporalUnitParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  Card,
  DashboardCard,
  Parameter,
  ParameterTarget,
} from "metabase-types/api";

import { DashCardCardParameterMapperButton } from "./DashCardCardParameterMapperButton";
import S from "./DashCardParameterMapper.module.css";
import { DisabledNativeCardHelpText } from "./DisabledNativeCardHelpText";

interface DashCardCardParameterMapperContentProps {
  isNative: boolean;
  isDisabled: boolean;
  isMobile: boolean;
  isQuestion: boolean;
  shouldShowAutoConnectHint: boolean;
  dashcard: DashboardCard;
  question: Question | undefined;
  editingParameter: Parameter | null | undefined;
  mappingOptions: ParameterMappingOption[];
  card: Card;
  selectedMappingOption: ParameterMappingOption | undefined;
  target: ParameterTarget | null | undefined;
  layoutHeight: number;
  editingParameterInlineDashcard?: DashboardCard;
  compact?: boolean;
  additionalActionParametersContent?: string;
}

export const DashCardCardParameterMapperContent = ({
  layoutHeight,
  dashcard,
  isNative,
  isMobile,
  isDisabled,
  question,
  editingParameter,
  mappingOptions,
  selectedMappingOption,
  isQuestion,
  card,
  target,
  shouldShowAutoConnectHint,
  editingParameterInlineDashcard,
  compact,
  additionalActionParametersContent,
}: DashCardCardParameterMapperContentProps) => {
  const isVirtual = isVirtualDashCard(dashcard);
  const virtualCardType = getVirtualCardType(dashcard);
  const isTemporalUnit =
    editingParameter != null && isTemporalUnitParameter(editingParameter);

  const dispatch = useDispatch();

  const isInlineParameterFromAnotherTab = useMemo(() => {
    return (
      editingParameterInlineDashcard != null &&
      editingParameterInlineDashcard.dashboard_tab_id !==
        dashcard.dashboard_tab_id
    );
  }, [editingParameterInlineDashcard, dashcard.dashboard_tab_id]);

  const isInlineParameterOfAnotherQuestionCard = useMemo(() => {
    return (
      editingParameterInlineDashcard != null &&
      isQuestionDashCard(editingParameterInlineDashcard) &&
      editingParameterInlineDashcard.id !== dashcard.id
    );
  }, [editingParameterInlineDashcard, dashcard.id]);

  const hasExistingConnection = useMemo(() => {
    return target != null;
  }, [target]);

  const headerContent = useMemo(() => {
    if (layoutHeight <= 2) {
      return null;
    }

    if (isTemporalUnit) {
      return t`Connect to`;
    }

    if (!isVirtual && !(isNative && isDisabled)) {
      return t`Column to filter on`;
    }

    return t`Variable to map to`;
  }, [layoutHeight, isTemporalUnit, isVirtual, isNative, isDisabled]);

  const handleChangeTarget = useCallback(
    (target: ParameterTarget | null) => {
      if (editingParameter) {
        dispatch(
          setParameterMapping(
            editingParameter.id,
            dashcard.id,
            card.id,
            target,
          ),
        );
      }
    },
    [card.id, dashcard.id, dispatch, editingParameter],
  );

  const mappingInfoText =
    (virtualCardType &&
      {
        heading: "",
        text: t`You can connect widgets to {{variables}} in text cards.`,
        link: t`You can connect widgets to {{variables}} in link cards.`,
        iframe: t`You can connect widgets to {{variables}} in iframe cards.`,
        action: t`Open this card's action settings to connect variables`,
        placeholder: "",
      }[virtualCardType]) ??
    "";

  if (isVirtual && isDisabled) {
    return showVirtualDashCardInfoText(dashcard, isMobile) ? (
      <Flex className={S.TextCardDefault} gap="sm" m={0}>
        <Icon
          name="info"
          size={12}
          className={S.InfoIcon}
          tooltip={additionalActionParametersContent}
        />
        <Box>{mappingInfoText}</Box>
      </Flex>
    ) : (
      <Flex
        className={S.TextCardDefault}
        gap="sm"
        m={0}
        aria-label={mappingInfoText}
      >
        <Icon
          name="info"
          size={16}
          className={classNames(CS.textDarkHover, S.InfoIcon)}
          tooltip={
            <Stack>
              <Box>{mappingInfoText}</Box>
              <Box>{additionalActionParametersContent}</Box>
            </Stack>
          }
        />
      </Flex>
    );
  }

  if (isNative && isDisabled && question && editingParameter) {
    return (
      <DisabledNativeCardHelpText
        question={question}
        parameter={editingParameter}
      />
    );
  }

  if (isInlineParameterFromAnotherTab) {
    return (
      <Flex className={S.TextCardDefault} gap="sm" align="center" ta="center">
        <Icon name="info" size={12} className={S.InfoIcon} />
        {t`The selected filter is on another tab.`}
      </Flex>
    );
  }

  if (isInlineParameterOfAnotherQuestionCard && !hasExistingConnection) {
    return (
      <Flex className={S.TextCardDefault} gap="sm" align="center" ta="center">
        <Icon name="info" size={12} className={S.InfoIcon} />
        {t`This filter can only connect to its own card.`}
      </Flex>
    );
  }

  const shouldShowAutoConnectIcon =
    shouldShowAutoConnectHint && layoutHeight <= 3 && dashcard.size_x > 4;

  return (
    <>
      {headerContent && (
        <Title order={4} w="100%" mb="sm" ta="center" className={S.Header}>
          <Ellipsified>{headerContent}</Ellipsified>
        </Title>
      )}
      <Flex align="center" justify="center" gap="xs" pos="relative">
        <DashCardCardParameterMapperButton
          key={editingParameter?.id}
          handleChangeTarget={handleChangeTarget}
          isVirtual={isVirtual}
          isQuestion={isQuestion}
          isDisabled={isDisabled}
          selectedMappingOption={selectedMappingOption}
          question={question}
          card={card}
          target={target}
          mappingOptions={mappingOptions}
          compact={compact}
        />
        {shouldShowAutoConnectIcon && <AutoConnectedAnimatedIcon />}
      </Flex>
    </>
  );
};

function AutoConnectedAnimatedIcon() {
  const [mounted, setMounted] = useState(false);

  useMount(() => {
    setMounted(true);
  });

  return (
    <Transition transition="fade" mounted={mounted} exitDuration={0}>
      {(styles) => {
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
