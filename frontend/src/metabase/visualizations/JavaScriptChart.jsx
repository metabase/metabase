import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import CardRenderer from "./components/CardRenderer.jsx";

import * as Babel from "babel-standalone";

import dc from "dc";
import d3 from "d3";
import crossfilter from "crossfilter";

const INJECT_NAMES = ["d3", "dc", "crossfilter", "React"];
const INJECT_VALUES = [d3, dc, crossfilter, React];

export default class JavaScriptChart extends Component {
    constructor(props, context) {
        super();
        this.state = {
            renderer: this._compileRenderer(props)
        };
    }

    componentWillReceiveProps(newProps) {
        if (this.props.definition !== newProps.definition) {
            this.setState({
                renderer: this._compileRenderer(newProps)
            });
        }
    }

    _compileRenderer(props) {
        const { definition, settings } = props;
        let renderer;
        try {
            const transpiled = Babel.transform(
                definition,
                { presets: ["es2015", "stage-0", "react"] }
            ).code;

            renderer = new Function(
                ...INJECT_NAMES, "element", "props", "exports",
                transpiled
            ).bind(null, ...INJECT_VALUES);

            if (settings["custom.type"] === "react") {
                const exports = {};
                renderer(null, props, exports);
                const Component = exports.default;
                if (!Component) {
                    throw new Error("Should `export default` a React component");
                }
                return (element, props) => {
                    ReactDOM.render(
                        <Component {...props} />
                    , element);
                }
            } else {
                return renderer;
            }
        } catch (err) {
            console.error(err);
            return () => { this.props.onRenderError(err.message || err); return null; };
        }
    }

    render() {
        return <CardRenderer {...this.props} renderer={this.state.renderer} />;
    }
}
