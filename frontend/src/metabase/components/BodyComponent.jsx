import React, { Component } from "react";
import ReactDOM from "react-dom";

export default ComposedComponent => class extends Component {
    static displayName = "BodyComponent["+(ComposedComponent.displayName || ComposedComponent.name)+"]";

    componentWillMount() {
        this._element = document.createElement('div');
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
        ReactDOM.unstable_renderSubtreeIntoContainer(this,
            <ComposedComponent {...this.props} className={undefined} />
        , this._element);
    }

    render() {
        return null;
    }
};
