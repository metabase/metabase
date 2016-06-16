/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import Icon from "metabase/components/Icon.jsx";
import ParameterEditorParam from "./ParameterEditorParam.jsx";

export default class ParameterEditorSidebar extends Component {

    static propTypes = {
        card: PropTypes.object.isRequired,
        onClose: PropTypes.func.isRequired,
        updateParameter: PropTypes.func.isRequired
    };

    render() {
        const { card } = this.props;

        return (
            <div className="DataReference-container p3 full-height scroll-y">
                <div className="DataReference-header flex align-center mb2">
                    <h2 className="text-default">
                        Variables
                    </h2>
                    <a className="flex-align-right text-default text-brand-hover no-decoration" onClick={() => this.props.onClose()}>
                        <Icon name="close" width="18px" height="18px" />
                    </a>
                </div>
                <div className="DataReference-content">
                    { card && card.parameters && card.parameters.map(parameter =>
                        <div key={parameter.id}>
                            <ParameterEditorParam parameter={parameter} onUpdate={(p) => this.props.updateParameter(p)} />
                        </div>
                    )}
                </div>
            </div>
        );
    }
}
