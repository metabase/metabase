/* eslint-disable react/prop-types */
import styled from "@emotion/styled";
import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import {
  OptionItemDescription,
  OptionItemRoot,
  OptionItemTitle,
} from "metabase/dashboard/components/ParametersPopover.styled";
import {
  getDashboardParameterSections,
  getDefaultOptionForParameterSection,
} from "metabase/parameters/utils/dashboard-options";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import { Icon } from "metabase/ui";

const PopoverBody = styled.div`
  max-width: 300px;
`;

const defaultOptionForParameterSection = getDefaultOptionForParameterSection();

export class ParametersPopover extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  PARAMETER_SECTIONS = getDashboardParameterSections();

  render() {
    const { onClose, onAddParameter } = this.props;

    return (
      <ParameterOptionsSectionsPane
        sections={this.PARAMETER_SECTIONS}
        onSelectSection={selectedSection => {
          const parameterSection = _.findWhere(this.PARAMETER_SECTIONS, {
            id: selectedSection.id,
          });

          if (parameterSection) {
            const defaultOption =
              defaultOptionForParameterSection[parameterSection.id];

            onAddParameter(defaultOption);
            onClose();
          }
        }}
      />
    );
  }
}

export const ParameterOptionsSection = ({ section, onClick }) => (
  <OptionItemRoot onClick={onClick}>
    <OptionItemTitle
      className={cx(CS.textBold, CS.flex, CS.alignCenter)}
      style={{ marginBottom: 4 }}
    >
      <Icon
        size="16"
        name={getParameterIconName(section.id)}
        className={CS.mr1}
      />
      {section.name}
    </OptionItemTitle>
    <OptionItemDescription>{section.description}</OptionItemDescription>
  </OptionItemRoot>
);

export const ParameterOptionsSectionsPane = ({ sections, onSelectSection }) => (
  <PopoverBody className={CS.pb2}>
    <h3
      className={cx(CS.pb2, CS.pt3, CS.px3)}
    >{t`What do you want to filter?`}</h3>
    <ul>
      {sections.map(section => (
        <ParameterOptionsSection
          key={section.id}
          section={section}
          onClick={() => onSelectSection(section)}
        />
      ))}
    </ul>
  </PopoverBody>
);

export const ParameterOptionItem = ({ option, onClick }) => (
  <OptionItemRoot onClick={onClick}>
    <OptionItemTitle className={CS.textBold} style={{ marginBottom: 4 }}>
      {option.menuName || option.name}
    </OptionItemTitle>
    <OptionItemDescription>{option.description}</OptionItemDescription>
  </OptionItemRoot>
);

export const ParameterOptionsPane = ({ options, onSelectOption }) => (
  <PopoverBody className={CS.pb2}>
    <h3 className={cx(CS.pb2, CS.pt3, CS.px3)}>{t`What kind of filter?`}</h3>
    <ul>
      {options &&
        options.map(option => (
          <ParameterOptionItem
            key={option.menuName || option.name}
            option={option}
            onClick={() => onSelectOption(option)}
          />
        ))}
    </ul>
  </PopoverBody>
);
