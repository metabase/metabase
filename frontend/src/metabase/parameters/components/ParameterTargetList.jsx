/* eslint-disable react/prop-types */
import { Component } from "react";
import _ from "underscore";

import {
  QueryColumnInfoIcon,
  HoverParent,
} from "metabase/components/MetadataInfo/ColumnInfoIcon";
import AccordionList from "metabase/core/components/AccordionList";
import { DelayGroup, Icon } from "metabase/ui";

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
      <DelayGroup>
        <AccordionList
          className="text-brand"
          maxHeight={this.props.maxHeight || 600}
          sections={sections}
          onChange={item => this.props.onChange(item.target)}
          itemIsSelected={item => _.isEqual(item.target, target)}
          renderItemIcon={item => (
            <Icon name={item.icon || "unknown"} size={18} />
          )}
          renderItemExtra={renderItemExtra}
          renderItemWrapper={renderItemWrapper}
          alwaysExpanded={true}
          hideSingleSectionTitle={!hasForeignOption}
        />
      </DelayGroup>
    );
  }
}

function renderItemExtra(item) {
  if (!item.query || item.stageIndex === undefined || !item.column) {
    return null;
  }

  return (
    <QueryColumnInfoIcon
      query={item.query}
      stageIndex={item.stageIndex}
      column={item.column}
      position="right"
    />
  );
}

function renderItemWrapper(content) {
  return <HoverParent>{content}</HoverParent>;
}
