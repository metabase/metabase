import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ParameterTargetList } from "metabase/parameters/components/ParameterTargetList";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import { Box, Flex, Icon, Popover, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, ParameterTarget } from "metabase-types/api";

import S from "./DashCardParameterMapper.module.css";

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
  compact?: boolean;
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
  compact,
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

    const { isEditable } = Lib.queryDisplayInfo(question.query());
    return isEditable;
  }, [isVirtual, isQuestion, question, card.dataset_query]);

  const { buttonVariant, buttonTooltip, buttonText, buttonIcon } =
    useMemo(() => {
      if (!hasPermissionsToMap) {
        return {
          buttonVariant: "unauthed",
          buttonTooltip: t`You don’t have permission to see this question’s columns.`,
          buttonText: null,
          buttonIcon: <Icon size={18} className={S.KeyIcon} name="key" />,
        };
      }

      if (target != null && !selectedMappingOption) {
        return {
          buttonVariant: "invalid",
          buttonText: t`Unknown Field`,
          buttonIcon: (
            <Button
              icon="close"
              iconSize={12}
              className={S.CloseIconButton}
              aria-label={t`Disconnect`}
              onClick={(e) => {
                handleChangeTarget(null);
                e.stopPropagation();
              }}
            />
          ),
        };
      }

      if (isDisabled && !isVirtual) {
        return {
          buttonVariant: "disabled",
          buttonTooltip: t`This card doesn't have any fields or parameters that can be mapped to this parameter type.`,
          buttonText: t`No valid fields`,
          buttonIcon: null,
        };
      }

      if (selectedMappingOption) {
        return {
          buttonVariant: "mapped",
          buttonTooltip: null,
          buttonText: formatSelected(selectedMappingOption),
          buttonIcon: (
            <Button
              icon="close"
              className={S.CloseIconButton}
              role="button"
              aria-label={t`Disconnect`}
              onClick={(e) => {
                handleChangeTarget(null);
                e.stopPropagation();
              }}
            />
          ),
        };
      }

      return {
        buttonVariant: "default",
        buttonTooltip: null,
        buttonText: t`Select…`,
        buttonIcon: <Icon size={12} mt="2px" name="chevrondown" />,
      };
    }, [
      hasPermissionsToMap,
      isDisabled,
      isVirtual,
      selectedMappingOption,
      target,
      handleChangeTarget,
    ]);

  return (
    <Popover
      position="bottom-start"
      closeOnClickOutside
      trapFocus
      disabled={isDisabled || !hasPermissionsToMap}
      opened={isDropdownVisible}
      onChange={setIsDropdownVisible}
    >
      <Popover.Target>
        <Tooltip label={buttonTooltip} disabled={!buttonTooltip} inline>
          <Flex
            component="button"
            role="button"
            onClick={() => setIsDropdownVisible(!isDropdownVisible)}
            disabled={buttonVariant === "disabled"}
            className={cx(S.TargetButton, {
              [S.disabled]: buttonVariant === "disabled",
              [S.mapped]: buttonVariant === "mapped",
              [S.unauthed]: buttonVariant === "unauthed",
              [S.invalid]: buttonVariant === "invalid",
            })}
            align="center"
            maw="100%"
            justify="space-between"
            mx="xs"
            px="sm"
            py={compact ? undefined : "xs"}
            aria-label={buttonTooltip ?? undefined}
            aria-haspopup="listbox"
            aria-expanded={isDropdownVisible}
            aria-disabled={isDisabled || !hasPermissionsToMap}
          >
            {buttonText && (
              <Box
                className={S.TargetButtonText}
                mr="sm"
                ta="center"
                component="span"
              >
                <Ellipsified>{buttonText}</Ellipsified>
              </Box>
            )}
            {buttonIcon}
          </Flex>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown style={{ boxSizing: "content-box" }}>
        <ParameterTargetList
          onChange={(target: ParameterTarget) => {
            handleChangeTarget(target);
            setIsDropdownVisible(false);
          }}
          mappingOptions={mappingOptions}
          selectedMappingOption={selectedMappingOption}
        />
      </Popover.Dropdown>
    </Popover>
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
