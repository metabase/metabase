import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import FieldWidget from "./FieldWidget";
import SelectionModule from "./SelectionModule";

export default class SortWidget extends React.Component {
  static propTypes = {
    sort: PropTypes.array.isRequired,
    fieldOptions: PropTypes.object.isRequired,
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

  handleChangeField = value => {
    if (this.state.field !== value) {
      this.props.updateOrderBy([this.state.direction, value]);
      // Optimistically set field state so componentWillUnmount logic works correctly
      this.setState({ field: value });
    }
  };

  handleChangeDirection = value => {
    if (this.state.direction !== value) {
      this.props.updateOrderBy([value, this.state.field]);
      // Optimistically set direction state so componentWillUnmount logic works correctly
      this.setState({ direction: value });
    }
  };

  render() {
    const directionOptions = [
      { key: "ascending", val: "asc" },
      { key: "descending", val: "desc" },
    ];

    return (
      <div className="flex align-center">
        <FieldWidget
          className="Filter-section Filter-section-sort-field SelectionModule"
          field={this.state.field}
          onChangeField={this.handleChangeField}
          fieldOptions={this.props.fieldOptions}
          query={this.props.query}
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
          action={this.handleChangeField}
        />

        <a onClick={this.props.removeOrderBy}>
          <Icon name="close" size={12} />
        </a>
      </div>
    );
  }
}
