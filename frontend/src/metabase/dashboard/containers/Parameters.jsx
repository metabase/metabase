/* @flow weak */

import React, { Component, PropTypes } from "react";

import ParameterWidget from "./ParameterWidget.jsx";

import querystring from "querystring";

export default class Parameters extends Component {
    componentWillMount() {
        // sync parameters from URL query string
        const { parameters, setParameterValue, query } = this.props;
        for (const parameter of parameters) {
            if (query && query[parameter.slug] != null) {
                setParameterValue(parameter.id, query[parameter.slug]);
            } else if (parameter.default != null) {
                setParameterValue(parameter.id, parameter.default);
            }
        }
    }

    componentDidUpdate() {
        // sync parameters to URL query string
        const { parameters } = this.props;
        const queryParams = {};
        for (const parameter of parameters) {
            if (parameter.value) {
                queryParams[parameter.slug] = parameter.value;
            }
        }

        let search = querystring.stringify(queryParams);
        search = (search ? "?" + search : "");

        if (search !== window.location.search) {
            history.replaceState(null, document.title, window.location.pathname + search + window.location.hash);
        }
    }

    render() {
        const {
            parameters,
            editingParameter, setEditingParameter,
            isEditing, isFullscreen, isNightMode, isQB,
            setParameterName, setParameterValue, setParameterDefaultValue, removeParameter
        } = this.props;
        return (
            <div className="flex flex-row align-end">
                { parameters.map(parameter =>
                    <ParameterWidget
                        key={parameter.id}

                        isEditing={isEditing}
                        isFullscreen={isFullscreen}
                        isNightMode={isNightMode}
                        isQB={isQB}

                        parameter={parameter}
                        parameters={parameters}

                        editingParameter={editingParameter}
                        setEditingParameter={setEditingParameter}

                        setName={(name) => setParameterName(parameter.id, name)}
                        setValue={(value) => setParameterValue(parameter.id, value)}
                        setDefaultValue={(value) => setParameterDefaultValue(parameter.id, value)}
                        remove={() => removeParameter(parameter.id)}
                    />
                ) }
            </div>
        );
    }
}
