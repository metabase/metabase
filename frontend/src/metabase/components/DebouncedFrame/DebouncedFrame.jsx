/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import CS from "metabase/css/core/index.css";

const DEBOUNCE_PERIOD = 300;

/**
 * This component prevents children elements from being rerendered while it's being resized (currently hard-coded debounce period of 250ms)
 * Useful for rendering components that maybe take a long time to render but you still wnat to allow their container to be resized fluidly
 * We also fade the component out and block mouse events while it's transitioning
 */

class DebouncedFrame extends Component {
  // NOTE: don't keep `_transition` in component state because we don't want to trigger a rerender when we update it
  // Instead manually modify the style in _updateTransitionStyle
  // There's probably a better way to block renders of children though
  _transition = false;

  static defaultProps = {
    enabled: true,
  };

  constructor(props) {
    super(props);
    this.state = {
      width: props.width,
      height: props.height,
    };
  }

  updateSize = () => {
    this._transition = false;

    const { width, height } = this.props;
    if (width !== this.state.width || height !== this.state.height) {
      this.setState({ width, height }, this._updateTransitionStyle);
    } else {
      this._updateTransitionStyle();
    }
  };

  updateSizeDebounced = _.debounce(this.updateSize, DEBOUNCE_PERIOD);

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (!nextProps.enabled) {
      this._updateTransitionStyle();
      return;
    }
    if (
      this.state.width !== nextProps.width ||
      this.state.height !== nextProps.height
    ) {
      if (this.state.width == null || this.state.height == null) {
        this.updateSizeDebounced();
      } else {
        this._transition = true;
        this._updateTransitionStyle();
        this.updateSizeDebounced();
      }
    }
  }

  componentDidMount() {
    this._updateTransitionStyle();
  }

  componentDidUpdate() {
    this._updateTransitionStyle();
  }

  _updateTransitionStyle = () => {
    if (this._container) {
      const transition = this._transition && this.props.enabled;
      this._container.style.opacity = transition ? "0.5" : null;
      this._container.style.pointerEvents = transition ? "none" : null;
    }
  };

  render() {
    const { children, className, style = {}, enabled } = this.props;
    // if disabled use width and height from props directly
    const { width, height } =
      enabled && this.state.width != null && this.state.height != null
        ? this.state
        : this.props;
    return (
      <div
        ref={r => (this._container = r)}
        className={cx(className, CS.relative)}
        style={{
          overflow: "hidden",
          transition: "opacity 0.25s",
          ...style,
        }}
      >
        <div className={CS.absolute} style={{ width, height }}>
          {children}
        </div>
      </div>
    );
  }
}

export default ExplicitSize()(DebouncedFrame);
