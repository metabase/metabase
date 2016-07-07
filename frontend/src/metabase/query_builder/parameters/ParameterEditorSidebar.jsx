/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import Icon from "metabase/components/Icon.jsx";
import ParameterEditorParam from "./ParameterEditorParam.jsx";

import cx from "classnames";

export default class ParameterEditorSidebar extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            section: null
        };
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        onClose: PropTypes.func.isRequired,
        updateParameter: PropTypes.func.isRequired
    };

    render() {
        const { card } = this.props;
        const parameters = (card && card.parameters) || [];

        let section;
        if (parameters.length === 0) {
            section = "help";
        } else if (this.state.section == null) {
            section = "settings";
        } else {
            section = this.state.section;
        }
        console.log("section", section, parameters)
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
                    <div className="Button-group Button-group--brand text-uppercase mb2">
                        <a className={cx("Button Button--small", { "Button--active": section === "settings" , "disabled": parameters.length === 0 })} onClick={() => this.setState({ section: "settings" })}>Settings</a>
                        <a className={cx("Button Button--small", { "Button--active": section === "help" })} onClick={() => this.setState({ section: "help" })}>Help</a>
                    </div>
                    { section === "settings" ?
                        <SettingsPane parameters={parameters} onUpdate={this.props.updateParameter}/>
                    :
                        <HelpPane />
                    }
                </div>
            </div>
        );
    }
}

const SettingsPane = ({ parameters, onUpdate }) =>
    <div>
        { parameters.map(parameter =>
            <div key={parameter.id}>
                <ParameterEditorParam parameter={parameter} onUpdate={onUpdate} />
            </div>
        ) }
    </div>

const HelpPane = () =>
    <div>
        <h3>What's this for?</h3>
        <p>Parameters and variables in native queries let you dynamically replace values in your queries using the selection widgets or through the URL.</p>
        <h3>Syntax</h3>
        <p>lorem ipsum</p>
    </div>
