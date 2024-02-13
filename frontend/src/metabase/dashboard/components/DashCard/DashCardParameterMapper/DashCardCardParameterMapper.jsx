import { useState, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";

import {
  MOBILE_HEIGHT_BY_DISPLAY_TYPE,
  MOBILE_DEFAULT_CARD_HEIGHT,
} from "metabase/visualizations/shared/utils/sizes";

import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import MetabaseSettings from "metabase/lib/settings";
import { getMetadata } from "metabase/selectors/metadata";

import ParameterTargetList from "metabase/parameters/components/ParameterTargetList";
import {
  getNativeDashCardEmptyMappingText,
  isNativeDashCard,
  isVirtualDashCard,
  getVirtualCardType,
  showVirtualDashCardInfoText,
} from "metabase/dashboard/utils";

import { isActionDashCard } from "metabase/actions/utils";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Question from "metabase-lib/Question";
import { isVariableTarget } from "metabase-lib/parameters/utils/targets";
import { isDateParameter } from "metabase-lib/parameters/utils/parameter-type";

import { normalize } from "metabase-lib/queries/utils/normalize";
import {
  getEditingParameter,
  getParameterTarget,
  getParameterMappingOptions,
} from "../../../selectors";
import { setParameterMapping } from "../../../actions";

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
  NativeCardDefault,
  NativeCardIcon,
  NativeCardText,
  NativeCardLink,
} from "./DashCardCardParameterMapper.styled";

function formatSelected({ name, sectionName }) {
  if (sectionName == null) {
    // for native question variables or field literals we just display the name
    return name;
  }
  return `${sectionName}.${name}`;
}

const mapStateToProps = (state, props) => ({
  editingParameter: getEditingParameter(state, props),
  target: getParameterTarget(state, props),
  mappingOptions: getParameterMappingOptions(state, props),
  metadata: getMetadata(state),
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
}) {
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  const hasSeries = dashcard.series && dashcard.series.length > 0;
  const isDisabled = mappingOptions.length === 0 || isActionDashCard(dashcard);
  const selectedMappingOption = _.find(mappingOptions, option =>
    _.isEqual(normalize(option.target), normalize(target)),
  );

  const handleChangeTarget = useCallback(
    target => {
      setParameterMapping(editingParameter.id, dashcard.id, card.id, target);
    },
    [card.id, dashcard.id, editingParameter.id, setParameterMapping],
  );

  const isVirtual = isVirtualDashCard(dashcard);
  const virtualCardType = getVirtualCardType(dashcard);
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
  }, [card, metadata, isVirtual]);

  const { buttonVariant, buttonTooltip, buttonText, buttonIcon } =
    useMemo(() => {
      if (!hasPermissionsToMap) {
        return {
          buttonVariant: "unauthed",
          buttonTooltip: t`You don’t have permission to see this question’s columns.`,
          buttonText: null,
          buttonIcon: <KeyIcon />,
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
          buttonIcon: <ChevrondownIcon />,
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
                  onChange={target => {
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
                aria-label={buttonTooltip}
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

export const DashCardCardParameterMapperConnected = connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashCardCardParameterMapper);
