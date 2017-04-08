import React, { Component } from "react";
import ReactDOM from "react-dom";

import ResizeObserver from "resize-observer-polyfill";

export default ComposedComponent => class extends Component {
    static displayName = "ExplicitSize["+(ComposedComponent.displayName || ComposedComponent.name)+"]";

    constructor(props, context) {
        super(props, context);
        this.state = {
            width: null,
            height: null
        };
    }

    componentDidMount() {
        // media query listener, ensure re-layout when printing
        this._mql = window.matchMedia("print");
        this._mql.addListener(this._updateSize);

        // resize observer, ensure re-layout when container element changes size
        this._ro = new ResizeObserver((entries, observer) => {
            const element = ReactDOM.findDOMNode(this);
            for (const entry of entries) {
                if (entry.target === element) {
                    this._updateSize();
                    break;
                }
            }
        });
        this._ro.observe(ReactDOM.findDOMNode(this));

        this._updateSize();
    }

    componentDidUpdate() {
        this._updateSize();
    }

    componentWillUnmount() {
        this._ro.disconnect();
        this._mql.removeListener(this._updateSize);
    }

    _updateSize = () => {
        const { width, height } = ReactDOM.findDOMNode(this).getBoundingClientRect();
        if (this.state.width !== width || this.state.height !== height) {
            this.setState({ width, height });
        }
    }

    render() {
        return <ComposedComponent {...this.props} {...this.state} />
    }
}
