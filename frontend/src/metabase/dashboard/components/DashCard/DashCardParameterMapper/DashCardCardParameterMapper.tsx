import { useState, useMemo, useCallback } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { isActionDashCard } from "metabase/actions/utils";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Tooltip from "metabase/core/components/Tooltip";
import {
  isNativeDashCard,
  isVirtualDashCard,
  getVirtualCardType,
  showVirtualDashCardInfoText,
  isQuestionDashCard,
} from "metabase/dashboard/utils";
import ParameterTargetList from "metabase/parameters/components/ParameterTargetList";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import { getMetadata } from "metabase/selectors/metadata";
import { Icon } from "metabase/ui";
import {
  MOBILE_HEIGHT_BY_DISPLAY_TYPE,
  MOBILE_DEFAULT_CARD_HEIGHT,
} from "metabase/visualizations/shared/utils/sizes";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";
import { isParameterVariableTarget } from "metabase-lib/parameters/utils/targets";
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

import { setParameterMapping } from "../../../actions";
import {
  getEditingParameter,
  getDashcardParameterMappingOptions,
  getParameterTarget,
  getQuestionByCard,
} from "../../../selectors";
import { getMappingOptionByTarget } from "../utils";

import {
  Container,
  CardLabel,
  Header,
  TargetButton,
  TargetButtonText,
  TextCardDefault,
  CloseIconButton,
  ChevrondownIcon,
  KeyIcon,
  Warning,
} from "./DashCardCardParameterMapper.styled";
import { DisabledNativeCardHelpText } from "./DisabledNativeCardHelpText";

function formatSelected({
  name,
  sectionName,
}: {
  name: string;
  sectionName?: string;
}) {
  if (sectionName == null) {
    // for native question variables or field literals we just display the name
    return name;
  }
  return `${sectionName}.${name}`;
}

const mapStateToProps = (
  state: State,
  props: DashcardCardParameterMapperProps,
) => ({
  editingParameter: getEditingParameter(state),
  target: getParameterTarget(state, props),
  metadata: getMetadata(state),
  question: getQuestionByCard(state, props),
  mappingOptions: getDashcardParameterMappingOptions(state, props),
});

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
}: DashcardCardParameterMapperProps) {
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  const hasSeries =
    isQuestionDashCard(dashcard) &&
    dashcard.series &&
    dashcard.series.length > 0;
  const isDisabled = mappingOptions.length === 0 || isActionDashCard(dashcard);

  const handleChangeTarget = useCallback(
    target => {
      if (editingParameter) {
        setParameterMapping(editingParameter.id, dashcard.id, card.id, target);
      }
    },
    [card.id, dashcard.id, editingParameter, setParameterMapping],
  );

  const isVirtual = isVirtualDashCard(dashcard);
  const virtualCardType = getVirtualCardType(dashcard);
  const isNative = isQuestionDashCard(dashcard) && isNativeDashCard(dashcard);

  const selectedMappingOption = getMappingOptionByTarget(
    mappingOptions,
    dashcard,
    target,
    question,
  );

  const hasPermissionsToMap = useMemo(() => {
    if (isVirtual) {
      return true;
    }

    // virtual or action dashcard
    if (!isQuestionDashCard(dashcard)) {
      return true;
    }

    if (!question || !card.dataset_query) {
      return false;
    }

    const { isEditable } = Lib.queryDisplayInfo(question.query());
    return isEditable;
  }, [isVirtual, dashcard, card.dataset_query, question]);

  const { buttonVariant, buttonTooltip, buttonText, buttonIcon } =
    useMemo(() => {
      if (!hasPermissionsToMap) {
        return {
          buttonVariant: "unauthed",
          buttonTooltip: t`You don’t have permission to see this question’s columns.`,
          buttonText: null,
          buttonIcon: <KeyIcon name="key" />,
        };
      } else if (isDisabled && !isVirtual) {
        return {
          buttonVariant: "disabled",
          buttonTooltip: t`This card doesn't have any fields or parameters that can be mapped to this parameter type.`,
          buttonText: t`No valid fields`,
          buttonIcon: null,
        };
      } else if (selectedMappingOption) {
        return {
          buttonVariant: "mapped",
          buttonTooltip: null,
          buttonText: formatSelected(selectedMappingOption),
          buttonIcon: (
            <CloseIconButton
              role="button"
              aria-label={t`Disconnect`}
              onClick={e => {
                handleChangeTarget(null);
                e.stopPropagation();
              }}
            />
          ),
        };
      } else if (target != null) {
        return {
          buttonVariant: "invalid",
          buttonText: t`Unknown Field`,
          buttonIcon: (
            <CloseIconButton
              onClick={e => {
                handleChangeTarget(null);
                e.stopPropagation();
              }}
            />
          ),
        };
      } else {
        return {
          buttonVariant: "default",
          buttonTooltip: null,
          buttonText: t`Select…`,
          buttonIcon: <ChevrondownIcon name="chevrondown" />,
        };
      }
    }, [
      hasPermissionsToMap,
      isDisabled,
      selectedMappingOption,
      target,
      handleChangeTarget,
      isVirtual,
    ]);

  const headerContent = useMemo(() => {
    const layoutHeight = isMobile
      ? MOBILE_HEIGHT_BY_DISPLAY_TYPE[dashcard.card.display] ||
        MOBILE_DEFAULT_CARD_HEIGHT
      : dashcard.size_y;

    if (layoutHeight > 2) {
      if (!isVirtual && !(isNative && isDisabled)) {
        return t`Column to filter on`;
      } else {
        return t`Variable to map to`;
      }
    }
    return null;
  }, [dashcard, isVirtual, isNative, isDisabled, isMobile]);

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
      ) : isNative && isDisabled && editingParameter ? (
        <DisabledNativeCardHelpText parameter={editingParameter} />
      ) : (
        <>
          {headerContent && (
            <Header>
              <Ellipsified>{headerContent}</Ellipsified>
            </Header>
          )}
          <Tooltip tooltip={buttonTooltip}>
            <TippyPopover
              visible={isDropdownVisible && !isDisabled && hasPermissionsToMap}
              onClickOutside={() => setIsDropdownVisible(false)}
              placement="bottom-start"
              content={
                <ParameterTargetList
                  onChange={(target: ParameterTarget) => {
                    handleChangeTarget(target);
                    setIsDropdownVisible(false);
                  }}
                  target={target}
                  mappingOptions={mappingOptions}
                />
              }
            >
              <TargetButton
                variant={buttonVariant}
                aria-label={buttonTooltip ?? undefined}
                aria-haspopup="listbox"
                aria-expanded={isDropdownVisible}
                aria-disabled={isDisabled || !hasPermissionsToMap}
                onClick={() => {
                  setIsDropdownVisible(true);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    setIsDropdownVisible(true);
                  }
                }}
              >
                {buttonText && (
                  <TargetButtonText>
                    <Ellipsified>{buttonText}</Ellipsified>
                  </TargetButtonText>
                )}
                {buttonIcon}
              </TargetButton>
            </TippyPopover>
          </Tooltip>
        </>
      )}
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

export const DashCardCardParameterMapperConnected = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashCardCardParameterMapper);
