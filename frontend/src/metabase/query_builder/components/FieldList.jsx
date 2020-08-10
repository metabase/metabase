/* @flow weak */

import React, { Component } from "react";

import DimensionList from "./DimensionList";

import Dimension from "metabase-lib/lib/Dimension";
import DimensionOptions from "metabase-lib/lib/DimensionOptions";

import type { ConcreteField } from "metabase-types/types/Query";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

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

  handleChangeOther = item => {
    if (item.filter && this.props.onFilterChange) {
      this.props.onFilterChange(item.filter);
    }
  };

  render() {
    const { field, query, metadata } = this.props;
    const dimension =
      field &&
      (query
        ? query.parseFieldReference(field)
        : Dimension.parseMBQL(field, metadata));
    return (
      <DimensionList
        sections={this.state.sections}
        dimension={dimension}
        onChangeDimension={this.handleChangeDimension}
        onChangeOther={this.handleChangeOther}
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
