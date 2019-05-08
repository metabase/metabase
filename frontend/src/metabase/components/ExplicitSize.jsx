import React, { Component } from "react";
import ReactDOM from "react-dom";

import ResizeObserver from "resize-observer-polyfill";

export default measureClass => ComposedComponent =>
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
      if (measureClass) {
        const elements = element.getElementsByClassName(measureClass);
        if (elements.length > 0) {
          return elements[0];
        }
      }
      return element;
    }

    // ResizeObserver, ensure re-layout when container element changes size
    _initResizeObserver() {
      const element = this._getElement();
      if (element !== this._currentElement) {
        // cleanup previous, if any
        this._teardownResizeObserver();
        // setup new, if we have an element
        if (element) {
          this._ro = new ResizeObserver((entries, observer) => {
            const element = this._getElement();
            for (const entry of entries) {
              if (entry.target === element) {
                this._updateSize();
                break;
              }
            }
          });
          this._ro.observe(element);
        }
        this._currentElement = element;
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

    componentDidMount() {
      this._initMediaQueryListener();
      this._initResizeObserver();
      this._updateSize();
    }

    componentDidUpdate() {
      // re-init ResizeObserver if element changes
      this._initResizeObserver();
      this._updateSize();
    }

    componentWillUnmount() {
      this._teardownResizeObserver();
      this._teardownQueryMediaListener();
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
      return <ComposedComponent {...this.props} {...this.state} />;
    }
  };
