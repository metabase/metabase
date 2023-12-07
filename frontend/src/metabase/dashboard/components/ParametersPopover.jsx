/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import styled from "@emotion/styled";
import _ from "underscore";
import { getDashboardParameterSections } from "metabase/parameters/utils/dashboard-options";
import { Icon } from "metabase/core/components/Icon";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import {
  OptionItemDescription,
  OptionItemRoot,
  OptionItemTitle,
} from "metabase/dashboard/components/ParametersPopover.styled";

const PopoverBody = styled.div`
  max-width: 300px;
`;

export class ParametersPopover extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {};
  }

  PARAMETER_SECTIONS = getDashboardParameterSections();

  render() {
    const { section } = this.state;
    const { onClose, onAddParameter } = this.props;
    if (section == null) {
      return (
        <ParameterOptionsSectionsPane
          sections={this.PARAMETER_SECTIONS}
          onSelectSection={selectedSection => {
            const parameterSection = _.findWhere(this.PARAMETER_SECTIONS, {
              id: selectedSection.id,
            });
            if (parameterSection && parameterSection.options.length === 1) {
              onAddParameter(parameterSection.options[0]);
              onClose();
            } else {
              this.setState({ section: selectedSection.id });
            }
          }}
        />
      );
    } else {
      const parameterSection = _.findWhere(this.PARAMETER_SECTIONS, {
        id: section,
      });
      return (
        <ParameterOptionsPane
          options={parameterSection && parameterSection.options}
          onSelectOption={option => {
            onAddParameter(option);
            onClose();
          }}
        />
      );
    }
  }
}

export const ParameterOptionsSection = ({ section, onClick }) => (
  <OptionItemRoot onClick={onClick}>
    <OptionItemTitle
      className="text-bold flex align-center"
      style={{ marginBottom: 4 }}
    >
      <Icon size="16" name={getParameterIconName(section.id)} className="mr1" />
      {section.name}
    </OptionItemTitle>
    <OptionItemDescription>{section.description}</OptionItemDescription>
  </OptionItemRoot>
);

export const ParameterOptionsSectionsPane = ({ sections, onSelectSection }) => (
  <PopoverBody className="pb2">
    <h3 className="pb2 pt3 px3">{t`What do you want to filter?`}</h3>
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
    <OptionItemTitle className="text-bold" style={{ marginBottom: 4 }}>
      {option.menuName || option.name}
    </OptionItemTitle>
    <OptionItemDescription>{option.description}</OptionItemDescription>
  </OptionItemRoot>
);

export const ParameterOptionsPane = ({ options, onSelectOption }) => (
  <PopoverBody className="pb2">
    <h3 className="pb2 pt3 px3">{t`What kind of filter?`}</h3>
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
