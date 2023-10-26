import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import {
  ChevrondownIcon,
  CloseIconButton,
  Header,
  KeyIcon,
  TargetButton,
  TargetButtonText,
} from "metabase/dashboard/components/DashCard/DashCardParameterMapperButton/DashCardCardParameterMapperButton.styled";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Tooltip from "metabase/core/components/Tooltip";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import ParameterTargetList from "metabase/parameters/components/ParameterTargetList";
import type {
  DashboardCard,
  ParameterDimensionTarget,
  Card,
} from "metabase-types/api";
import {
  MOBILE_DEFAULT_CARD_HEIGHT,
  MOBILE_HEIGHT_BY_DISPLAY_TYPE,
} from "metabase/visualizations/shared/utils/sizes";

import { isNativeDashCard, isVirtualDashCard } from "metabase/dashboard/utils";
import { getParameterMappingOptions } from "metabase/dashboard/selectors";
import { getMetadata } from "metabase/selectors/metadata";
import { useSelector } from "metabase/lib/redux";
import Question from "metabase-lib/Question";
import { normalize } from "metabase-lib/queries/utils/normalize";

function formatSelected({
  name,
  sectionName,
}: {
  name: string;
  sectionName: string | null;
}) {
  if (sectionName == null) {
    // for native question variables or field literals we just display the name
    return name;
  }
  return `${sectionName}.${name}`;
}

type Props = {
  dashcard: DashboardCard;
  card: Card;
  isDisabled: boolean;
  isMobile: boolean;
  target?: ParameterDimensionTarget;
  handleChangeTarget: (value: ParameterDimensionTarget | null) => void;
};

export const DashCardCardParameterMapperButton = ({
  dashcard,
  card,
  isDisabled,
  isMobile,
  target,
  handleChangeTarget,
}: Props) => {
  const mappingOptions = useSelector(state =>
    getParameterMappingOptions(state, { dashcard, card }),
  );
  const metadata = useSelector(getMetadata);

  const selectedMappingOption = _.find(mappingOptions, option =>
    _.isEqual(normalize(option.target), normalize(target)),
  );

  const isVirtual = isVirtualDashCard(dashcard);
  const isNative = isNativeDashCard(dashcard);

  const hasPermissionsToMap = useMemo(() => {
    if (isVirtual) {
      return true;
    }

    if (!card.dataset_query) {
      return false;
    }

    const question = new Question(card, metadata);
    return question.query().isEditable();
  }, [card, isVirtual, metadata]);

  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  const { buttonVariant, buttonTooltip, buttonText, buttonIcon } =
    useMemo(() => {
      if (!hasPermissionsToMap) {
        return {
          buttonVariant: "unauthed",
          buttonTooltip: t`You don’t have permission to see this question’s columns.`,
          buttonText: null,
          buttonIcon: <KeyIcon size={18} name="key" />,
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
              onClick={e => {
                handleChangeTarget(null);
                e.stopPropagation();
              }}
              icon="close"
              size={12}
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
              icon="close"
              size={12}
            />
          ),
        };
      } else {
        return {
          buttonVariant: "default",
          buttonTooltip: null,
          buttonText: t`Select…`,
          buttonIcon: <ChevrondownIcon name="chevrondown" size={12} />,
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

  const getLayoutHeight = useCallback(() => {
    if (!isMobile) {
      return dashcard.size_y;
    }

    if (dashcard.card.display) {
      return MOBILE_HEIGHT_BY_DISPLAY_TYPE[dashcard.card.display];
    }

    return MOBILE_DEFAULT_CARD_HEIGHT;
  }, [dashcard, isMobile]);

  const headerContent = useMemo(() => {
    const layoutHeight = getLayoutHeight();

    if (layoutHeight > 2) {
      if (!isVirtual && !(isNative && isDisabled)) {
        return t`Column to filter on`;
      } else {
        return t`Variable to map to`;
      }
    }
    return null;
  }, [getLayoutHeight, isVirtual, isNative, isDisabled]);

  return (
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
              target={target}
              onChange={(target: ParameterDimensionTarget) => {
                handleChangeTarget(target);
                setIsDropdownVisible(false);
              }}
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
            onClick={e => {
              e.preventDefault();
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
  );
};
