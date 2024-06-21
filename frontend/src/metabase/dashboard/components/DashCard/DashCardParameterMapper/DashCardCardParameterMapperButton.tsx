import { useState, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import DeprecatedTooltip from "metabase/core/components/Tooltip";
import ParameterTargetList from "metabase/parameters/components/ParameterTargetList";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import type Question from "metabase-lib/v1/Question";
import type { Card, ParameterTarget } from "metabase-types/api";

import {
  TargetButton,
  TargetButtonText,
  CloseIconButton,
  ChevrondownIcon,
  KeyIcon,
} from "./DashCardCardParameterMapper.styled";

interface DashCardCardParameterMapperButtonProps {
  isDisabled: boolean;
  isVirtual: boolean;
  isQuestion: boolean;
  question: Question | undefined;
  card: Card;
  handleChangeTarget: (target: ParameterTarget | null) => void;
  selectedMappingOption: ParameterMappingOption | undefined;
  target: ParameterTarget | null | undefined;
  mappingOptions: ParameterMappingOption[];
}

export const DashCardCardParameterMapperButton = ({
  isDisabled,
  handleChangeTarget,
  isVirtual,
  isQuestion,
  question,
  card,
  selectedMappingOption,
  target,
  mappingOptions,
}: DashCardCardParameterMapperButtonProps) => {
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  const hasPermissionsToMap = useMemo(() => {
    if (isVirtual) {
      return true;
    }

    if (!isQuestion) {
      return true;
    }

    if (!question || !card.dataset_query) {
      return false;
    }

    return question.canRunAdhocQuery();
  }, [isVirtual, isQuestion, question, card.dataset_query]);

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
      isVirtual,
      selectedMappingOption,
      target,
      handleChangeTarget,
    ]);

  return (
    <DeprecatedTooltip tooltip={buttonTooltip}>
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
    </DeprecatedTooltip>
  );
};

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
