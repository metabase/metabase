import React from "react";

import cx from "classnames";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";

const DEBOUNCE_PERIOD = 300;

/**
 * This component prevents children elements from being rerendered while it's being resized (currently hard-coded debounce period of 250ms)
 * Useful for rendering components that maybe take a long time to render but you still wnat to allow their container to be resized fluidly
 * We also fade the component out and block mouse events while it's transitioning
 */
@ExplicitSize()
export default class DebouncedFrame extends React.Component {
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

  setSize = (width, height) => {
    this._transition = false;
    this.setState({ width, height }, this._updateTransitionStyle);
  };

  setSizeDebounced = _.debounce(this.setSize, DEBOUNCE_PERIOD);

  componentWillReceiveProps(nextProps) {
    if (!nextProps.enabled) {
      this._updateTransitionStyle();
      return;
    }
    if (
      this.props.width !== nextProps.width ||
      this.props.height !== nextProps.height
    ) {
      if (this.state.width == null || this.state.height == null) {
        this.setSize(nextProps.width, nextProps.height);
      } else {
        this.setSizeDebounced(nextProps.width, nextProps.height);
        this._transition = true;
        this._updateTransitionStyle();
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
        className={cx(className, "relative")}
        style={{
          overflow: "hidden",
          transition: "opacity 0.25s",
          ...style,
        }}
      >
        <div className="absolute" style={{ width, height }}>
          {children}
        </div>
      </div>
    );
  }
}
