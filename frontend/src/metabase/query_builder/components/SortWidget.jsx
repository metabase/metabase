import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon.jsx";
import FieldWidget from "./FieldWidget.jsx";
import SelectionModule from "./SelectionModule.jsx";

import _ from "underscore";

export default class SortWidget extends Component {
  constructor(props, context) {
    super(props, context);

    _.bindAll(this, "setDirection", "setField");
  }

  static propTypes = {
    sort: PropTypes.array.isRequired,
    fieldOptions: PropTypes.object.isRequired,
    customFieldOptions: PropTypes.object,
    tableName: PropTypes.string,
    updateOrderBy: PropTypes.func.isRequired,
    removeOrderBy: PropTypes.func.isRequired,
    tableMetadata: PropTypes.object.isRequired,
  };

  componentWillMount() {
    this.componentWillReceiveProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.setState({
      field: newProps.sort[1], // id of the field
      direction: newProps.sort[0], // sort direction
    });
  }

  componentWillUnmount() {
    // Remove partially completed sort if the widget is removed
    if (this.state.field == null || this.state.direction == null) {
      this.props.removeOrderBy();
    }
  }

  setField(value) {
    if (this.state.field !== value) {
      this.props.updateOrderBy([this.state.direction, value]);
      // Optimistically set field state so componentWillUnmount logic works correctly
      this.setState({ field: value });
    }
  }

  setDirection(value) {
    if (this.state.direction !== value) {
      this.props.updateOrderBy([value, this.state.field]);
      // Optimistically set direction state so componentWillUnmount logic works correctly
      this.setState({ direction: value });
    }
  }

  render() {
    let directionOptions = [
      { key: "ascending", val: "asc" },
      { key: "descending", val: "desc" },
    ];

    return (
      <div className="flex align-center">
        <FieldWidget
          query={this.props.query}
          className="Filter-section Filter-section-sort-field SelectionModule"
          tableMetadata={this.props.tableMetadata}
          field={this.state.field}
          fieldOptions={this.props.fieldOptions}
          customFieldOptions={this.props.customFieldOptions}
          setField={this.setField}
          isInitiallyOpen={this.state.field === null}
          enableSubDimensions={false}
          useOriginalDimension={true}
        />

        <SelectionModule
          className="Filter-section Filter-section-sort-direction"
          placeholder="..."
          items={directionOptions}
          display="key"
          selectedValue={this.state.direction}
          selectedKey="val"
          isInitiallyOpen={false}
          action={this.setDirection}
        />

        <a onClick={this.props.removeOrderBy}>
          <Icon name="close" size={12} />
        </a>
      </div>
    );
  }
}
