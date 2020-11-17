import React, { Component } from "react";
import PropTypes from "prop-types";

import Popover from "metabase/components/Popover";

import Clearable from "./Clearable";
import BreakoutPopover from "./BreakoutPopover";

// NOTE: lots of duplication between AggregationWidget and BreakoutWidget

export default class BreakoutWidget extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      isOpen: props.isInitiallyOpen || false,
    };
  }

  static propTypes = {
    breakout: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
    onChangeBreakout: PropTypes.func.isRequired,
    query: PropTypes.object.isRequired,
    breakoutOptions: PropTypes.object,
    isInitiallyOpen: PropTypes.bool,
    enableSubDimensions: PropTypes.bool,
    children: PropTypes.object,
  };

  static defaultProps = {
    enableSubDimensions: true,
  };

  handleChangeBreakout = value => {
    this.props.onChangeBreakout(value);
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
      breakout,
      query,
      enableSubDimensions,
      className,
      children,
    } = this.props;

    const breakoutOptions =
      this.props.breakoutOptions || query.breakoutOptions();

    const popover = this.state.isOpen && (
      <Popover id="BreakoutPopover" onClose={this.handleClose}>
        <BreakoutPopover
          query={query}
          breakout={breakout}
          breakoutOptions={breakoutOptions}
          onChangeBreakout={this.handleChangeBreakout}
          enableSubDimensions={enableSubDimensions}
        />
      </Popover>
    );

    const trigger = breakout ? (
      <Clearable onClear={() => this.handleChangeBreakout(null)}>
        <span className={className}>{breakout.displayName()}</span>
      </Clearable>
    ) : breakoutOptions && breakoutOptions.count > 0 ? (
      children
    ) : null;

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
