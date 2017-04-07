/* @flow weak */

import React, { Component, PropTypes } from "react";

import ParameterWidget from "./ParameterWidget.jsx";

import querystring from "querystring";
import cx from "classnames";

export default class Parameters extends Component {
    defaultProps = {
        syncQueryString: false,
        vertical: false,
    }

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
        if (this.props.syncQueryString) {
            // sync parameters to URL query string
            const queryParams = {};
            for (const parameter of this._parametersWithValues()) {
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
    }

    _parametersWithValues() {
        const { parameters, parameterValues } = this.props;
        if (parameterValues) {
            return parameters.map(p => ({
                ...p,
                value: parameterValues[p.id]
            }));
        } else {
            return parameters;
        }
    }

    render() {
        const {
            className,
            editingParameter, setEditingParameter,
            isEditing, isFullscreen, isNightMode, isQB,
            setParameterName, setParameterValue, setParameterDefaultValue, removeParameter,
            vertical
        } = this.props;

        const parameters = this._parametersWithValues();

        return (
            <div className={cx(className, "flex align-end flex-wrap", vertical ? "flex-column" : "flex-row", {"mt1": isQB})}>
                { parameters.map(parameter =>
                    <ParameterWidget
                        className={vertical ? "mb2" : null}
                        key={parameter.id}

                        isEditing={isEditing}
                        isFullscreen={isFullscreen}
                        isNightMode={isNightMode}

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
