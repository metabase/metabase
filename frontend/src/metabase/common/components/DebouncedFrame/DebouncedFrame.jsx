/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component, forwardRef } from "react";
import _ from "underscore";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import CS from "metabase/css/core/index.css";

const DEBOUNCE_PERIOD = 300;

/**
 * This component prevents children elements from being rerendered while it's being resized (currently hard-coded debounce period of 250ms)
 * Useful for rendering components that maybe take a long time to render but you still want to allow their container to be resized fluidly
 * We also fade the component out and block mouse events while it's transitioning
 */

class DebouncedFrameInner extends Component {
  // NOTE: don't keep `_transition` in component state because we don't want to trigger a rerender when we update it
  // Instead manually modify the style in _updateTransitionStyle
  // There's probably a better way to block renders of children though
  _transition = false;

  // Used to trigger an immediate resize (without debounce/transition) without the need for remounting.
  // Useful if DebouncedFrame is resizing because of content loading in.
  // Will be set to true whenever `props.resetKey` changes.
  _queueImmediateResize = false;

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

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey) {
      this._queueImmediateResize = true;
    }
    if (this._queueImmediateResize) {
      const { width, height } = this.props;
      if (width !== this.state.width || height !== this.state.height) {
        this.setState({ width, height });
        this._transition = false;
        this._queueImmediateResize = false;
      }
    }

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
        data-testid="debounced-frame-root"
        ref={(r) => {
          if (this.props.forwardedRef) {
            if (typeof this.props.forwardedRef === "function") {
              this.props.forwardedRef(r);
            } else {
              this.props.forwardedRef = r;
            }
          }
          return (this._container = r);
        }}
        className={cx(className, CS.relative)}
        style={{
          overflow: "hidden",
          transition: "opacity 0.25s",
          ...style,
        }}
      >
        {width > 0 ? (
          <div className={CS.absolute} style={{ width, height }}>
            {children}
          </div>
        ) : null}
      </div>
    );
  }
}

const DebouncedFrameForwardRef = forwardRef(
  function _DebouncedFrameRefWrapper(props, ref) {
    return <DebouncedFrameInner {...props} forwardedRef={ref} />;
  },
);

export const DebouncedFrame = ExplicitSize({
  // Disable ExplicitSize's debounce/throttle since DebouncedFrame has a built-in debounce
  refreshMode: "none",
})(DebouncedFrameForwardRef);
