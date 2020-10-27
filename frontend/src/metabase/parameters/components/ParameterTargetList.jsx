/* @flow */

import React from "react";

import AccordionList from "metabase/components/AccordionList";
import Icon from "metabase/components/Icon";

import _ from "underscore";

import type {
  ParameterMappingUIOption,
  ParameterTarget,
} from "metabase-types/types/Parameter";

type Props = {
  target: ?ParameterTarget,
  onChange: (target: ?ParameterTarget) => void,
  mappingOptions: ParameterMappingUIOption[],
};

export default class ParameterTargetList extends React.Component {
  props: Props;

  render() {
    const { target, mappingOptions } = this.props;

    const mappingOptionSections = _.groupBy(mappingOptions, "sectionName");

    const hasForeignOption = _.any(mappingOptions, o => !!o.isForeign);

    const sections = _.map(mappingOptionSections, options => ({
      name: options[0].sectionName,
      items: options,
    }));

    return (
      <AccordionList
        className="text-brand"
        maxHeight={this.props.maxHeight || 600}
        sections={sections}
        onChange={item => this.props.onChange(item.target)}
        itemIsSelected={item => _.isEqual(item.target, target)}
        renderItemIcon={item => (
          <Icon name={item.icon || "unknown"} size={18} />
        )}
        alwaysExpanded={true}
        hideSingleSectionTitle={!hasForeignOption}
      />
    );
  }
}
