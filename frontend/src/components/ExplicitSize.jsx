import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

export default ComposedComponent => class extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            width: null,
            height: null
        };
    }

    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        const { width, height } = ReactDOM.findDOMNode(this).getBoundingClientRect();
        if (this.state.width !== width || this.state.height !== height) {
            this.setState({ width, height });
        }
    }

    render() {
        return <ComposedComponent {...this.state} {...this.props} />
    }
}
