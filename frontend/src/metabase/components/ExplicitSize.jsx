import React, { Component } from "react";
import ReactDOM from "react-dom";

import ResizeObserver from "resize-observer-polyfill";

import cx from "classnames";

export default ({ selector, wrapped } = {}) => ComposedComponent =>
  class extends Component {
    static displayName =
      "ExplicitSize[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    constructor(props, context) {
      super(props, context);
      this.state = {
        width: null,
        height: null,
      };
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
      this._updateResizeObserver();
      // Set the size on the next tick. We had issues with wrapped components
      // not adjusting if the size was fixed during mounting.
      setTimeout(this._updateSize, 0);
    }

    componentDidUpdate() {
      // update ResizeObserver if element changes
      this._updateResizeObserver();
      this._updateSize();
    }

    componentWillUnmount() {
      this._teardownResizeObserver();
      this._teardownQueryMediaListener();
    }

    // ResizeObserver, ensure re-layout when container element changes size
    _initResizeObserver() {
      this._ro = new ResizeObserver((entries, observer) => {
        const element = this._getElement();
        for (const entry of entries) {
          if (entry.target === element) {
            this._updateSize();
            return;
          }
        }
      });
    }
    _updateResizeObserver() {
      const element = this._getElement();
      if (this._currentElement !== element) {
        this._currentElement = element;
        this._ro.observe(this._currentElement);
      }
    }
    _teardownResizeObserver() {
      if (this._ro) {
        this._ro.disconnect();
        this._ro = null;
      }
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

    _updateSize = () => {
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
  };
