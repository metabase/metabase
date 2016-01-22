import React, { Component, PropTypes } from "react";

export default ComposedComponent => class extends Component {
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
        React.unmountComponentAtNode(this._element);
        if (this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
    }

    _render() {
        this._element.className = this.props.className;
        React.render(<ComposedComponent {...this.props} className={undefined} />, this._element);
    }

    render() {
        return <span />;
    }
};
