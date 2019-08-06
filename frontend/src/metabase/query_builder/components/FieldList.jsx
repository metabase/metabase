/* @flow weak */

import React, { Component } from "react";

import DimensionList from "./DimensionList";

import Dimension from "metabase-lib/lib/Dimension";
import DimensionOptions from "metabase-lib/lib/DimensionOptions";

import type { StructuredQuery, ConcreteField } from "metabase/meta/types/Query";
import type Table from "metabase-lib/lib/metadata/Table";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

// import type { Section } from "metabase/components/AccordionList";
export type AccordionListItem = {};

export type AccordionListSection = {
  name: ?string,
  items: AccordionListItem[],
};

type Props = {
  field: ?ConcreteField,
  onFieldChange: (field: ConcreteField) => void,
  fieldOptions: any,

  // HACK: for segments
  onFilterChange?: (filter: any) => void,

  table?: Table,
  // query should be included otherwise FieldList may not display field-literal display name correctly
  query?: StructuredQuery,
  metadata?: Metadata,

  // AccordionList props:
  className?: string,
  maxHeight?: number,
  width?: number,
  alwaysExpanded?: boolean,

  // DimensionList props:
  enableSubDimensions?: boolean,
  useOriginalDimension?: boolean,
};

type State = {
  sections: AccordionListSection[],
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
        icon: "star_outline",
        className: "List-item--segment",
      })),
    });
    this.setState({ sections });
  }

  handleChangeDimension = (dimension, item) => {
    this.props.onFieldChange(dimension.mbql(), item);
  };

  handleChange = item => {
    if (item.filter && this.props.onFilterChange) {
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
        // forward AccordionList props
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
