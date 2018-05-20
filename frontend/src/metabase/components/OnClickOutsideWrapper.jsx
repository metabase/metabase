import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import { KEYCODE_ESCAPE } from "metabase/lib/keyboard";

// keep track of the order popovers were opened so we only close the last one when clicked outside
const popoverStack = [];

export default class OnClickOutsideWrapper extends Component {
  static propTypes = {
    handleDismissal: PropTypes.func.isRequired,
  };

  static defaultProps = {
    dismissOnClickOutside: true,
    dismissOnEscape: true,
  };

  componentDidMount() {
    // necessary to ignore click events that fire immediately, causing modals/popovers to close prematurely
    this._timeout = setTimeout(() => {
      popoverStack.push(this);

      // HACK: set the z-index of the parent element to ensure it"s always on top
      // NOTE: this actually doesn"t seem to be working correctly for popovers since PopoverBody creates a stacking context
      ReactDOM.findDOMNode(this).parentNode.style.zIndex =
        popoverStack.length + 2; // HACK: add 2 to ensure it"s in front of main and nav elements

      if (this.props.dismissOnEscape) {
        document.addEventListener("keydown", this._handleKeyPress, false);
      }
      if (this.props.dismissOnClickOutside) {
        window.addEventListener("mousedown", this._handleClick, true);
      }
    }, 0);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this._handleKeyPress, false);
    window.removeEventListener("mousedown", this._handleClick, true);
    clearTimeout(this._timeout);

    // remove from the stack after a delay, if it is removed through some other
    // means this will happen too early causing parent modal to close
    setTimeout(() => {
      let index = popoverStack.indexOf(this);
      if (index >= 0) {
        popoverStack.splice(index, 1);
      }
    }, 0);
  }

  _handleClick = e => {
    if (!ReactDOM.findDOMNode(this).contains(e.target)) {
      setTimeout(this._handleDismissal, 0);
    }
  };

  _handleKeyPress = e => {
    if (e.keyCode === KEYCODE_ESCAPE) {
      e.preventDefault();
      this._handleDismissal();
    }
  };

  _handleDismissal = e => {
    // only propagate event for the popover on top of the stack
    if (this === popoverStack[popoverStack.length - 1]) {
      this.props.handleDismissal(e);
    }
  };

  render() {
    return React.Children.only(this.props.children);
  }
}
