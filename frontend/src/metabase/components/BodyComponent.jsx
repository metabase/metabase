import React, { Component } from "react";
import ReactDOM from "react-dom";

export default ComposedComponent =>
  class extends Component {
    static displayName =
      "BodyComponent[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    componentWillMount() {
      this._element = document.createElement("div");
      document.body.appendChild(this._element);
    }

    componentDidMount() {
      this._render();
    }

    componentDidUpdate() {
      this._render();
    }

    componentWillUnmount() {
      ReactDOM.unmountComponentAtNode(this._element);
      if (this._element.parentNode) {
        this._element.parentNode.removeChild(this._element);
      }
    }

    _render() {
      this._element.className = this.props.className || "";
      ReactDOM.unstable_renderSubtreeIntoContainer(
        this,
        <ComposedComponent {...this.props} className={undefined} />,
        this._element,
      );
    }

    render() {
      return null;
    }
  };

/**
 * A modified version of BodyComponent HOC for Jest/Enzyme tests.
 * Simply renders the component inline instead of mutating DOM root.
 */
export const TestBodyComponent = ComposedComponent =>
  class extends Component {
    static displayName =
      "TestBodyComponent[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    render() {
      return (
        <div
          // because popover is normally directly attached to body element, other elements should not need
          // to care about clicks that happen inside the popover
          onClick={e => {
            e.stopPropagation();
          }}
        >
          <ComposedComponent {...this.props} className={undefined} />
        </div>
      );
    }
  };
