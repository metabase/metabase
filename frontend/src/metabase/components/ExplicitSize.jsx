/* eslint-disable react/prop-types */
import React, { Component } from "react";
import ReactDOM from "react-dom";
import cx from "classnames";
import _ from "underscore";

import resizeObserver from "metabase/lib/resize-observer";
import { isCypressActive } from "metabase/env";

const WAIT_TIME = 300;

const REFRESH_MODE = {
  throttle: fn => _.throttle(fn, WAIT_TIME),
  debounce: fn => _.debounce(fn, WAIT_TIME),
  debounceLeading: fn => _.debounce(fn, WAIT_TIME, true),
  none: fn => fn,
};

export default ({
  selector,
  wrapped,
  refreshMode = "throttle",
} = {}) => ComposedComponent => {
  const displayName = ComposedComponent.displayName || ComposedComponent.name;

  class WrappedComponent extends Component {
    static displayName = `ExplicitSize[${displayName}]`;

    constructor(props, context) {
      super(props, context);
      this.state = {
        width: null,
        height: null,
      };

      if (isCypressActive) {
        this._updateSize = this.__updateSize;
      } else {
        this._refreshMode =
          typeof refreshMode === "function" ? refreshMode(props) : refreshMode;
        const refreshFn = REFRESH_MODE[this._refreshMode];
        this._updateSize = refreshFn(this.__updateSize);
      }
    }

    _getElement() {
      const element = ReactDOM.findDOMNode(this);
      if (selector) {
        return element.querySelector(selector) || element;
      }
      return element;
    }

    componentDidMount() {
      this._initMediaQueryListener();
      this._initResizeObserver();
      // Set the size on the next tick. We had issues with wrapped components
      // not adjusting if the size was fixed during mounting.
      setTimeout(this._updateSize, 0);
    }

    componentDidUpdate() {
      // update ResizeObserver if element changes
      this._updateResizeObserver();
      if (typeof refreshMode === "function" && !isCypressActive) {
        this._updateRefreshMode();
      }
    }

    componentWillUnmount() {
      this._teardownResizeObserver();
      this._teardownQueryMediaListener();
    }

    _updateRefreshMode = () => {
      const nextMode = refreshMode(this.props);
      if (nextMode === this._refreshMode) {
        return;
      }
      resizeObserver.unsubscribe(this._currentElement, this._updateSize);
      const refreshFn = REFRESH_MODE[nextMode];
      this._updateSize = refreshFn(this.__updateSize);
      resizeObserver.subscribe(this._currentElement, this._updateSize);
      this._refreshMode = nextMode;
    };

    // ResizeObserver, ensure re-layout when container element changes size
    _initResizeObserver() {
      this._currentElement = this._getElement();
      resizeObserver.subscribe(this._currentElement, this._updateSize);
    }

    _updateResizeObserver() {
      const element = this._getElement();
      if (this._currentElement !== element) {
        resizeObserver.unsubscribe(this._currentElement, this._updateSize);
        this._currentElement = element;
        resizeObserver.subscribe(this._currentElement, this._updateSize);
      }
    }

    _teardownResizeObserver() {
      resizeObserver.unsubscribe(this._currentElement, this._updateSize);
    }

    // media query listener, ensure re-layout when printing
    _initMediaQueryListener() {
      if (window.matchMedia) {
        this._mql = window.matchMedia("print");
        this._mql.addListener(this._updateSize);
      }
    }
    _teardownQueryMediaListener() {
      if (this._mql) {
        this._mql.removeListener(this._updateSize);
        this._mql = null;
      }
    }

    __updateSize = () => {
      const element = this._getElement();
      if (element) {
        const { width, height } = element.getBoundingClientRect();
        if (this.state.width !== width || this.state.height !== height) {
          this.setState({ width, height });
        }
      }
    };

    render() {
      if (wrapped) {
        const { className, style = {}, ...props } = this.props;
        const { width, height } = this.state;
        return (
          <div className={cx(className, "relative")} style={style}>
            <ComposedComponent
              style={{ position: "absolute", top: 0, left: 0, width, height }}
              {...props}
              {...this.state}
            />
          </div>
        );
      } else {
        return <ComposedComponent {...this.props} {...this.state} />;
      }
    }
  }

  return WrappedComponent;
};
