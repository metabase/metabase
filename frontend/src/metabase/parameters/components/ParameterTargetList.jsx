/* eslint-disable react/prop-types */
import { Component } from "react";
import _ from "underscore";

import AccordionList from "metabase/core/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

export default class ParameterTargetList extends Component {
  props;

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
        className={CS.textBrand}
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
