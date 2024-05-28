import PropTypes from "prop-types";
import { Children, Component } from "react";
import ReactDOM from "react-dom";

import {
  RENDERED_POPOVERS,
  removePopoverData,
  shouldClosePopover,
} from "metabase/hooks/use-sequenced-content-close-handler";

export default class OnClickOutsideWrapper extends Component {
  static propTypes = {
    children: PropTypes.node,
    backdropElement: PropTypes.object,
    handleDismissal: PropTypes.func.isRequired,
    ignoreElement: PropTypes.object,
  };

  componentDidMount() {
    // necessary to ignore click events that fire immediately, causing modals/popovers to close prematurely
    this._timeout = setTimeout(() => {
      const contentEl = ReactDOM.findDOMNode(this);

      this.popoverData = {
        contentEl,
        backdropEl: this.props.backdropElement,
        close: () => this.props.handleDismissal(),
        ignoreEl: this.props.ignoreElement,
      };

      RENDERED_POPOVERS.push(this.popoverData);

      // HACK: set the z-index of the parent element to ensure it"s always on top
      // NOTE: this actually doesn"t seem to be working correctly for popovers since PopoverBody creates a stacking context
      contentEl.parentNode.style.zIndex = RENDERED_POPOVERS.length + 2; // HACK: add 2 to ensure it"s in front of main and nav elements

      document.addEventListener("keydown", this._handleEvent, false);
      window.addEventListener("mousedown", this._handleEvent, true);
    }, 0);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this._handleEvent, false);
    window.removeEventListener("mousedown", this._handleEvent, true);
    clearTimeout(this._timeout);

    // remove from the stack after a delay, if it is removed through some other
    // means this will happen too early causing parent modal to close
    setTimeout(() => {
      removePopoverData(this.popoverData);
    }, 0);
  }

  _handleEvent = e => {
    if (shouldClosePopover(e, this.popoverData)) {
      this.popoverData.close();
    }
  };

  render() {
    return Children.only(this.props.children);
  }
}
