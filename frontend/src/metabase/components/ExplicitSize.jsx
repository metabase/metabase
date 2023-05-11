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

export default ({ selector, wrapped, refreshMode = "throttle" } = {}) =>
  ComposedComponent => {
    const displayName = ComposedComponent.displayName || ComposedComponent.name;

    class WrappedComponent extends Component {
      static displayName = `ExplicitSize[${displayName}]`;

      constructor(props, context) {
        super(props, context);
        this.state = {
          width: null,
          height: null,
        };

        this._printMediaQuery = window.matchMedia && window.matchMedia("print");
        const refreshFn = REFRESH_MODE[this._getRefreshMode()];
        this._updateSize = refreshFn(this.__updateSize);
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
        this.timeoutId = setTimeout(this._updateSize, 0);
      }

      componentDidUpdate() {
        // update ResizeObserver if element changes
        this._updateResizeObserver();
        this._updateRefreshMode();
      }

      componentWillUnmount() {
        this._teardownResizeObserver();
        this._teardownQueryMediaListener();
        clearTimeout(this.timeoutId);
      }

      _getRefreshMode = () => {
        if (isCypressActive || this._printMediaQuery?.matches) {
          return "none";
        } else if (typeof refreshMode === "function") {
          return refreshMode(this.props);
        } else {
          return refreshMode;
        }
      };

      _updateRefreshMode = () => {
        const nextMode = this._getRefreshMode();
        if (nextMode === this._refreshMode) {
          return;
        }
        resizeObserver.unsubscribe(this._currentElement, this._updateSize);
        const refreshFn = REFRESH_MODE[nextMode];
        this._updateSize = refreshFn(this.__updateSize);
        resizeObserver.subscribe(this._currentElement, this._updateSize);
        this._refreshMode = nextMode;
      };

      _updateSizeAndRefreshMode = () => {
        this._updateRefreshMode();
        this._updateSize();
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
        this._printMediaQuery?.addEventListener(
          "change",
          this._updateSizeAndRefreshMode,
        );
      }
      _teardownQueryMediaListener() {
        this._printMediaQuery?.removeEventListener(
          "change",
          this._updateSizeAndRefreshMode,
        );
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
