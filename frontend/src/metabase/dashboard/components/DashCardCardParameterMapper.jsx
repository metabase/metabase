import React, { useState, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import ParameterTargetList from "metabase/parameters/components/ParameterTargetList";
import { isVariableTarget } from "metabase/parameters/utils/targets";
import { isDateParameter } from "metabase/parameters/utils/parameter-type";
import { getMetadata } from "metabase/selectors/metadata";
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
};

function DashCardCardParameterMapper({
  card,
  dashcard,
  editingParameter,
  target,
  mappingOptions,
  metadata,
  setParameterMapping,
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

  const hasPermissionsToMap = useMemo(() => {
    const question = new Question(card, metadata);
    return question.query().isEditable();
  }, [card, metadata]);

  const { variant, tooltip, buttonText, buttonIcon } = useMemo(() => {
    if (!hasPermissionsToMap) {
      return {
        variant: "unauthed",
        tooltip: t`You don’t have permission to see this question’s columns.`,
        text: null,
        buttonIcon: <KeyIcon />,
      };
    } else if (isDisabled) {
      return {
        variant: "disabled",
        tooltip: t`This card doesn't have any fields or parameters that can be mapped to this parameter type.`,
        buttonText: t`No valid fields`,
        buttonIcon: null,
      };
    } else if (selectedMappingOption) {
      return {
        variant: "mapped",
        tooltip: null,
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
        variant: "default",
        tooltip: null,
        buttonText: t`Select…`,
        buttonIcon: <ChevrondownIcon />,
      };
    }
  }, [
    hasPermissionsToMap,
    isDisabled,
    selectedMappingOption,
    handleChangeTarget,
  ]);

  return (
    <Container>
      {hasSeries && <CardLabel>{card.name}</CardLabel>}
      <Header>{t`Column to filter on`}</Header>
      <Tooltip tooltip={tooltip}>
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
            variant={variant}
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
            {buttonText && <TargetButtonText>{buttonText}</TargetButtonText>}
            {buttonIcon}
          </TargetButton>
        </TippyPopover>
      </Tooltip>
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
