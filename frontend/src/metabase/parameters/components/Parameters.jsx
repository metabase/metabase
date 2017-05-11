/* @flow */

import React, { Component } from "react";

import ParameterWidget from "./ParameterWidget.jsx";

import querystring from "querystring";
import cx from "classnames";

import type { QueryParams } from "metabase/meta/types";
import type { ParameterId, Parameter, ParameterValues } from "metabase/meta/types/Parameter";

type Props = {
    className?:                 string,

    parameters:                 Parameter[],
    editingParameter:           ?Parameter,
    parameterValues:            ParameterValues,

    isFullscreen?:              boolean,
    isNightMode?:               boolean,
    isEditing?:                 boolean,
    isQB?:                      boolean,
    vertical?:                  boolean,
    commitImmediately?:         boolean,

    query:                      QueryParams,

    setParameterName:           (parameterId: ParameterId, name: string) => void,
    setParameterValue:          (parameterId: ParameterId, value: string) => void,
    setParameterDefaultValue:   (parameterId: ParameterId, defaultValue: string) => void,
    removeParameter:            (parameterId: ParameterId) => void,
    setEditingParameter:        (parameterId: ParameterId) => void,
}

export default class Parameters extends Component<*, Props, *> {
    defaultProps = {
        syncQueryString: false,
        vertical: false,
        commitImmediately: false
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
            vertical,
            commitImmediately
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

                        commitImmediately={commitImmediately}
                    />
                ) }
            </div>
        );
    }
}
