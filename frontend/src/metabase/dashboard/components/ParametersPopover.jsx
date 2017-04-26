/* @flow */
import React, { Component } from "react";

import { PARAMETER_SECTIONS } from "metabase/meta/Dashboard";

import type { Parameter, ParameterOption } from "metabase/meta/types/Parameter";

import _ from "underscore";

export default class ParametersPopover extends Component {
    props: {
        onAddParameter: (option: ParameterOption) => Promise<Parameter>,
        onClose: () => void
    };
    state: {
        section?: string
    };

    constructor(props: any, context: any) {
        super(props, context);
        this.state = {};
    }

    render() {
        const { section } = this.state;
        const { onClose, onAddParameter } = this.props;
        if (section == null) {
            return <ParameterOptionsSectionsPane sections={PARAMETER_SECTIONS} onSelectSection={(section) => {
                let parameterSection = _.findWhere(PARAMETER_SECTIONS, { id: section.id });
                if (parameterSection && parameterSection.options.length === 1) {
                    onAddParameter(parameterSection.options[0]);
                    onClose();
                } else {
                    this.setState({ section: section.id });
                }
            }} />
        } else {
            let parameterSection = _.findWhere(PARAMETER_SECTIONS, { id: section });
            return <ParameterOptionsPane options={parameterSection && parameterSection.options} onSelectOption={(option) => { onAddParameter(option); onClose(); } }/>
        }
    }
}

const ParameterOptionsSection = ({ section, onClick }) =>
    <li onClick={onClick} className="p1 px2 cursor-pointer brand-hover">
        <div className="text-brand text-bold">{section.name}</div>
        <div>{section.description}</div>
    </li>

const ParameterOptionsSectionsPane = ({ sections, onSelectSection }) =>
    <div className="pb2">
        <h3 className="p2">What do you want to filter?</h3>
        <ul>
            { sections.map(section =>
                <ParameterOptionsSection section={section} onClick={() => onSelectSection(section) }/>
            )}
        </ul>
    </div>

const ParameterOptionItem = ({ option, onClick }) =>
    <li onClick={onClick} className="p1 px2 cursor-pointer brand-hover">
        <div className="text-brand text-bold">{option.menuName || option.name}</div>
        <div>{option.description}</div>
    </li>

const ParameterOptionsPane = ({ options, onSelectOption }) =>
    <div className="pb2">
        <h3 className="p2">What kind of filter?</h3>
        <ul>
            { options && options.map(option =>
                <ParameterOptionItem option={option} onClick={() => onSelectOption(option)} />
            )}
        </ul>
    </div>
