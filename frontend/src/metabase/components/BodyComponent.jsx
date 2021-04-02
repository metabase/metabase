/* eslint-disable react/prop-types */
import React, { Component } from "react";
import ReactDOM from "react-dom";

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
      document.body.appendChild(this._element);
    }

    componentDidUpdate() {
      this._element.className = this.props.className || "";
    }

    componentWillUnmount() {
      document.body.removeChild(this._element);
    }

    render() {
      return ReactDOM.createPortal(
        <ComposedComponent {...this.props} className={undefined} />,
        this._element,
      );
    }
  };
