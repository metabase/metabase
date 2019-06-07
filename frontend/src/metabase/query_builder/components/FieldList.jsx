/* @flow weak */

import React, { Component } from "react";

import DimensionList from "./DimensionList";

import AccordianList from "metabase/components/AccordianList.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import { stripId, singularize } from "metabase/lib/formatting";

import Dimension, { BinnedDimension } from "metabase-lib/lib/Dimension";
import DimensionOptions from "metabase-lib/lib/DimensionOptions";

import type { ConcreteField } from "metabase/meta/types/Query";
import type Table from "metabase-lib/lib/metadata/Table";
import type { RenderItemWrapper } from "metabase/components/AccordianList.jsx";

// import type { Section } from "metabase/components/AccordianList";
export type AccordianListItem = {};

export type AccordianListSection = {
  name: ?string,
  items: AccordianListItem[],
};

type Props = {
  field: ?ConcreteField,
  onFieldChange: (field: ConcreteField) => void,
  fieldOptions: any,

  // HACK: for segments
  onFilterChange?: (filter: any) => void,

  table?: Table,
  // query should be included otherwise FieldList may not display field-literal display name correctly
  query?: Query,

  // AccordianList props:
  className?: string,
  maxHeight?: number,
  width?: number,
  alwaysExpanded?: boolean,

  // DimensionList props:
  enableSubDimensions?: boolean,
  useOriginalDimension?: boolean,
};

type State = {
  sections: AccordianListSection[],
};

// DEPRECATED: use DimensionList directly
export default class FieldList extends Component {
  props: Props;
  state: State = {
    sections: [],
  };

  componentWillMount() {
    this._updateSections(this.props);
  }
  componentWillReceiveProps(nextProps) {
    this._updateSections(nextProps);
  }
  _updateSections({
    fieldOptions = { dimensions: [], fks: [] },
    segmentOptions = [],
    table = null,
  } = {}) {
    const sections = new DimensionOptions(fieldOptions).sections({
      extraItems: segmentOptions.map(segment => ({
        filter: ["segment", segment.id],
        name: segment.name,
        icon: "staroutline",
        className: "List-item--segment",
      })),
    });
    this.setState({ sections });
  }

  handleChangeDimension = (dimension, item) => {
    this.props.onFieldChange(dimension.mbql(), item);
  };

  handleChange = item => {
    if (item.filter) {
      this.props.onFilterChange(item.filter);
    }
  };

  render() {
    const { field, metadata, query } = this.props;
    return (
      <DimensionList
        sections={this.state.sections}
        dimension={field && Dimension.parseMBQL(field, metadata, query)}
        onChangeDimension={this.handleChangeDimension}
        onChange={this.handleChange}
        // forward AccordianList props
        className={this.props.className}
        maxHeight={this.props.maxHeight}
        width={this.props.width}
        alwaysExpanded={this.props.alwaysExpanded}
        // forward DimensionList props
        useOriginalDimension={this.props.useOriginalDimension}
        enableSubDimensions={this.props.enableSubDimensions}
      />
    );
  }
}
