import React, { Component } from "react";
import PropTypes from "prop-types";

import Clearable from "./Clearable";

import Popover from "metabase/components/Popover";

import AggregationName from "./AggregationName";
import AggregationPopover from "./AggregationPopover";

// NOTE: lots of duplication between AggregationWidget and BreakoutWidget

export default class AggregationWidget extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      isOpen: props.isInitiallyOpen || false,
    };
  }

  static propTypes = {
    aggregation: PropTypes.array,
    onChangeAggregation: PropTypes.func.isRequired,
    query: PropTypes.object.isRequired,
    isInitiallyOpen: PropTypes.bool,
    children: PropTypes.object,
    showRawData: PropTypes.bool,
  };

  handleChangeAggregation = value => {
    this.props.onChangeAggregation(value);
    this.handleClose();
  };

  handleOpen = () => {
    this.setState({ isOpen: true });
  };

  handleClose = () => {
    this.setState({ isOpen: false });
  };

  render() {
    const {
      aggregation,
      query = aggregation.query && aggregation.query(),
      children,
      className,
    } = this.props;

    const popover = this.state.isOpen && (
      <Popover onClose={this.handleClose}>
        <AggregationPopover
          query={query}
          aggregation={aggregation}
          onChangeAggregation={this.handleChangeAggregation}
        />
      </Popover>
    );
    const trigger = aggregation ? (
      <Clearable
        onClear={
          query.canRemoveAggregation()
            ? () => this.handleChangeAggregation(null)
            : null
        }
      >
        <AggregationName
          query={query}
          aggregation={aggregation}
          className={className}
        />
      </Clearable>
    ) : (
      children
    );

    if (trigger) {
      return (
        <div onClick={this.handleOpen}>
          {trigger}
          {popover}
        </div>
      );
    } else {
      return null;
    }
  }
}
