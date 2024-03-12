/* eslint-disable react/prop-types */
import { Component } from "react";

import Dimension from "metabase-lib/v1/Dimension";
import DimensionOptions from "metabase-lib/v1/DimensionOptions";

import { DimensionList } from "../DimensionList";

/**
 * @deprecated use MLv2
 */
export class FieldList extends Component {
  state = {
    sections: [],
  };

  UNSAFE_componentWillMount() {
    this._updateSections(this.props);
  }
  UNSAFE_componentWillReceiveProps(nextProps) {
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
        icon: "star",
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
        preventNumberSubDimensions={this.props.preventNumberSubDimensions}
      />
    );
  }
}
