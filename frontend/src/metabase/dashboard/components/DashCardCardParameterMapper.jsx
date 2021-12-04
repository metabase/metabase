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

import {
  getEditingParameter,
  getMappingsByParameter,
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
  mappingsByParameter: getMappingsByParameter(state, props),
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
  mappingsByParameter: PropTypes.object.isRequired,
  setParameterMapping: PropTypes.func.isRequired,
};

function DashCardCardParameterMapper({
  card,
  dashcard,
  editingParameter,
  target,
  mappingsByParameter,
  mappingOptions,
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

  const { variant, buttonText, buttonIcon } = useMemo(() => {
    if (isDisabled) {
      return {
        variant: "disabled",
        buttonText: t`No valid fields`,
        buttonIcon: null,
      };
    } else if (selectedMappingOption) {
      return {
        variant: "mapped",
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
        buttonText: t`Select…`,
        buttonIcon: <ChevrondownIcon />,
      };
    }
  }, [isDisabled, selectedMappingOption, handleChangeTarget]);

  return (
    <Container>
      {hasSeries && <CardLabel>{card.name}</CardLabel>}

      <Header>{t`Column to filter on`}</Header>
      <Tooltip
        tooltip={
          isDisabled
            ? t`This card doesn't have any fields or parameters that can be mapped to this parameter type.`
            : null
        }
      >
        <TippyPopover
          visible={isDropdownVisible && !isDisabled}
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
            aria-disabled={isDisabled}
            onClick={() => {
              setIsDropdownVisible(true);
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                setIsDropdownVisible(true);
              }
            }}
          >
            <TargetButtonText>{buttonText}</TargetButtonText>
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
