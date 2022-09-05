import React, { useState, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import ParameterTargetList from "metabase/parameters/components/ParameterTargetList";
import { isVariableTarget } from "metabase/parameters/utils/targets";
import { isDateParameter } from "metabase/parameters/utils/parameter-type";
import { getMetadata } from "metabase/selectors/metadata";
import {
  isVirtualDashCard,
  showVirtualDashCardInfoText,
} from "metabase/dashboard/utils";
import Question from "metabase-lib/lib/Question";

import {
  getEditingParameter,
  getParameterTarget,
  makeGetParameterMappingOptions,
} from "../selectors";
import { setParameterMapping } from "../actions";
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
  mappingOptions: makeGetParameterMappingOptions()(state, props),
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

function DashCardCardParameterMapper({
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
  const onlyAcceptsSingleValue =
    isVariableTarget(target) && !isDateParameter(editingParameter);
  const isDisabled = mappingOptions.length === 0;
  const selectedMappingOption = _.find(mappingOptions, o =>
    _.isEqual(o.target, target),
  );

  const handleChangeTarget = useCallback(
    target => {
      setParameterMapping(editingParameter.id, dashcard.id, card.id, target);
    },
    [card.id, dashcard.id, editingParameter.id, setParameterMapping],
  );

  const isVirtual = isVirtualDashCard(dashcard);

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
      handleChangeTarget,
      isVirtual,
    ]);

  const headerContent = useMemo(() => {
    if (!isVirtual) {
      return t`Column to filter on`;
    } else if (dashcard.sizeY !== 1 || isMobile) {
      return t`Variable to map to`;
    } else {
      return null;
    }
  }, [dashcard, isVirtual, isMobile]);

  const mappingInfoText = t`You can connect widgets to {{variables}} in text cards.`;

  return (
    <Container>
      {hasSeries && <CardLabel>{card.name}</CardLabel>}
      {isVirtual && isDisabled ? (
        showVirtualDashCardInfoText(dashcard, isMobile) ? (
          <TextCardDefault>
            <Icon name="info" size={12} className="pr1" />
            {mappingInfoText}
          </TextCardDefault>
        ) : (
          <TextCardDefault>
            <Icon
              name="info"
              size={16}
              className="text-dark-hover"
              tooltip={mappingInfoText}
            />
          </TextCardDefault>
        )
      ) : (
        <>
          {headerContent && <Header>{headerContent}</Header>}
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
                  <TargetButtonText>{buttonText}</TargetButtonText>
                )}
                {buttonIcon}
              </TargetButton>
            </TippyPopover>
          </Tooltip>
        </>
      )}
      {onlyAcceptsSingleValue && (
        <Warning>
          {t`This field only accepts a single value because it's used in a SQL query.`}
        </Warning>
      )}
    </Container>
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DashCardCardParameterMapper);
