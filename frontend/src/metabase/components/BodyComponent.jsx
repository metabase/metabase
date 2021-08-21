/* eslint-disable react/prop-types */
import React, { Component } from "react";
import ReactDOM from "react-dom";

import { getFloatRoot } from "metabase/lib/dom";

export default ComposedComponent =>
  class extends Component {
    static displayName =
      "BodyComponent[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    constructor(props) {
      super(props);

      this._element = document.createElement("div");
      this._element.className = props.className || "";
      getFloatRoot().appendChild(this._element);
    }

    componentDidUpdate() {
      this._element.className = this.props.className || "";
    }

    componentWillUnmount() {
      getFloatRoot().removeChild(this._element);
    }

    render() {
      return ReactDOM.createPortal(
        <ComposedComponent {...this.props} className={undefined} />,
        this._element,
      );
    }
  };
