import React, { Component } from "react";
import PropTypes from "prop-types";

import BreakoutName from "./BreakoutName.jsx";
import BreakoutPopover from "./BreakoutPopover.jsx";
import Popover from "metabase/components/Popover.jsx";

import _ from "underscore";
import cx from "classnames";

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

  renderPopover() {
    const {
      breakout,
      query,
      breakoutOptions,
      enableSubDimensions,
    } = this.props;
    if (this.state.isOpen) {
      return (
        <Popover
          id="BreakoutPopover"
          ref="popover"
          className="FieldPopover"
          onClose={this.handleClose}
        >
          <BreakoutPopover
            query={query}
            breakout={breakout}
            breakoutOptions={breakoutOptions}
            onChangeBreakout={this.handleChangeBreakout}
            enableSubDimensions={enableSubDimensions}
          />
        </Popover>
      );
    }
  }

  render() {
    const { breakout, query, children } = this.props;

    const breakoutOptions =
      this.props.breakoutOptions || query.breakoutOptions();

    if (breakout) {
      return (
        <div onClick={this.handleOpen}>
          <BreakoutName
            className={cx(this.props.className, "QueryOption")}
            breakout={breakout}
            query={query}
            onRemove={() => this.handleChangeBreakout(null)}
          />
          {this.renderPopover()}
        </div>
      );
    } else if (children && breakoutOptions && breakoutOptions.count > 0) {
      return (
        <div onClick={this.handleOpen}>
          {children}
          {this.renderPopover()}
        </div>
      );
    } else {
      return null;
    }
  }
}
