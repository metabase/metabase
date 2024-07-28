import { useState, useMemo, useCallback } from "react";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { setParameterMapping } from "metabase/dashboard/actions/parameters";
import {
  isVirtualDashCard,
  getVirtualCardType,
  showVirtualDashCardInfoText,
} from "metabase/dashboard/utils";
import { useDispatch } from "metabase/lib/redux";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import { Flex, Icon, Transition, Tooltip, Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import { isTemporalUnitParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  Card,
  DashboardCard,
  Parameter,
  ParameterTarget,
} from "metabase-types/api";

import { Header, TextCardDefault } from "./DashCardCardParameterMapper.styled";
import { DashCardCardParameterMapperButton } from "./DashCardCardParameterMapperButton";
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
}: DashCardCardParameterMapperContentProps) => {
  const isVirtual = isVirtualDashCard(dashcard);
  const virtualCardType = getVirtualCardType(dashcard);
  const isTemporalUnit =
    editingParameter != null && isTemporalUnitParameter(editingParameter);

  const dispatch = useDispatch();

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
        heading: t`You can connect widgets to {{variables}} in heading cards.`,
        text: t`You can connect widgets to {{variables}} in text cards.`,
        link: t`You cannot connect variables to link cards.`,
        action: t`Open this card's action settings to connect variables`,
        placeholder: "",
      }[virtualCardType]) ??
    "";

  if (isVirtual && isDisabled) {
    return showVirtualDashCardInfoText(dashcard, isMobile) ? (
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

  const shouldShowAutoConnectIcon =
    shouldShowAutoConnectHint && layoutHeight <= 3 && dashcard.size_x > 4;

  return (
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
