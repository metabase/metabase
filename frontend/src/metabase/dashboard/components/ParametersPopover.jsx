/* @flow */
import React, { Component } from "react";
import { t } from "ttag";
import { PARAMETER_SECTIONS } from "metabase/meta/Dashboard";

import type {
  Parameter,
  ParameterOption,
} from "metabase-types/types/Parameter";

import _ from "underscore";

import type { ParameterSection } from "metabase/meta/Dashboard";

export default class ParametersPopover extends Component {
  props: {
    onAddParameter: (option: ParameterOption) => Promise<Parameter>,
    onClose: () => void,
  };
  state: {
    section?: string,
  };

  constructor(props: any, context: any) {
    super(props, context);
    this.state = {};
  }

  render() {
    const { section } = this.state;
    const { onClose, onAddParameter } = this.props;
    if (section == null) {
      return (
        <ParameterOptionsSectionsPane
          sections={PARAMETER_SECTIONS}
          onSelectSection={selectedSection => {
            const parameterSection = _.findWhere(PARAMETER_SECTIONS, {
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
      const parameterSection = _.findWhere(PARAMETER_SECTIONS, { id: section });
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

export const ParameterOptionsSection = ({
  section,
  onClick,
}: {
  section: ParameterSection,
  onClick: () => any,
}) => (
  <li onClick={onClick} className="p1 px2 cursor-pointer brand-hover">
    <div className="text-brand text-bold">{section.name}</div>
    <div>{section.description}</div>
  </li>
);

export const ParameterOptionsSectionsPane = ({
  sections,
  onSelectSection,
}: {
  sections: Array<ParameterSection>,
  onSelectSection: ParameterSection => any,
}) => (
  <div className="pb2">
    <h3 className="p2">{t`What do you want to filter?`}</h3>
    <ul>
      {sections.map(section => (
        <ParameterOptionsSection
          section={section}
          onClick={() => onSelectSection(section)}
        />
      ))}
    </ul>
  </div>
);

export const ParameterOptionItem = ({
  option,
  onClick,
}: {
  option: ParameterOption,
  onClick: () => any,
}) => (
  <li onClick={onClick} className="p1 px2 cursor-pointer brand-hover">
    <div className="text-brand text-bold">{option.menuName || option.name}</div>
    <div>{option.description}</div>
  </li>
);

export const ParameterOptionsPane = ({
  options,
  onSelectOption,
}: {
  options: ?Array<ParameterOption>,
  onSelectOption: ParameterOption => any,
}) => (
  <div className="pb2">
    <h3 className="p2">{t`What kind of filter?`}</h3>
    <ul>
      {options &&
        options.map(option => (
          <ParameterOptionItem
            option={option}
            onClick={() => onSelectOption(option)}
          />
        ))}
    </ul>
  </div>
);
