import React, { Component, PropTypes } from 'react';
import { connect } from "react-redux";

import ParameterValueWidget from "../components/parameters/ParameterValueWidget.jsx";
import Icon from "metabase/components/Icon.jsx";

import S from "./ParameterWidget.css";
import cx from "classnames";
import _ from "underscore";

import { getMappingsByParameter } from "../selectors";

const makeMapStateToProps = () => {
    const mapStateToProps = (state, props) => ({
        mappingsByParameter: getMappingsByParameter(state, props)
    });
    return mapStateToProps;
}

const mapDispatchToProps = {
};


@connect(makeMapStateToProps, mapDispatchToProps)
export default class ParameterWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isEditingName: false
        };
    }
    static propTypes = {
        parameter: PropTypes.object
    };

    static defaultProps = {
        parameter: null,
    }

    getValues() {
        const { parameter, mappingsByParameter } = this.props;
        return _.chain(mappingsByParameter[parameter.id])
            .map(_.values)
            .flatten()
            .map(m => m.values || [])
            .flatten()
            .sortBy(_.identity)
            .uniq(true)
            .value();
    }

    renderPopover(value, setValue) {
        const { parameter, editingParameter } = this.props;
        const isEditingParameter = !!(editingParameter && editingParameter.id === parameter.id);
        const values = this.getValues();
        return (
            <ParameterValueWidget
                parameter={parameter}
                value={value}
                values={values}
                setValue={setValue}
                isEditing={isEditingParameter}
            />
        );
    }

    render() {
        const { className, parameter, parameterValue, parameters, isEditing, isFullscreen, editingParameter, setEditingParameterId, setName, setValue, setDefaultValue, remove } = this.props;

        const isEditingDashboard = isEditing;
        const isEditingParameter = editingParameter && editingParameter.id === parameter.id;

        if (isFullscreen) {
            if (parameterValue != null) {
                return (
                    <div className={cx(className, S.container, S.fullscreen)}>
                        <div className={S.name}>{parameter.name}</div>
                        <div className={cx(S.parameter, S.selected)}>
                            {ParameterValueWidget.getWidget(parameter, this.getValues()).format(parameterValue)}
                        </div>
                    </div>
                );
            } else {
                return <span className="hide" />;
            }
        } else if (!isEditingDashboard) {
            return (
                <div className={cx(className, S.container)}>
                    <div className={S.name}>{parameter.name}</div>
                    {this.renderPopover(parameterValue, (value) => setValue(value))}
                </div>
            );
        } else if (isEditingParameter) {
            return (
                <div className={cx(className, S.container)}>
                    { this.state.isEditingName ?
                        <input
                            type="text"
                            className={cx(S.nameInput, { "border-error": _.any(parameters, (p) => p.name === parameter.name && p.id !== parameter.id) })}
                            value={parameter.name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={() => this.setState({ isEditingName: false })}
                            onKeyUp={(e) => {
                                if (e.keyCode === 27 || e.keyCode === 13) {
                                    e.target.blur();
                                }
                            }}
                            autoFocus
                        />
                    :
                        <div className={S.name}>
                            {parameter.name}
                            <Icon name="pencil" size={12} className="ml1 text-brand cursor-pointer" onClick={() => this.setState({ isEditingName: true })} />
                        </div>
                    }
                    {this.renderPopover(parameter.default, (value) => setDefaultValue(value))}
                </div>
            );
        } else {
            return (
                <div className={cx(className, S.container, { [S.deemphasized]: !isEditingParameter && editingParameter != null})}>
                    <div className={S.name}>{parameter.name}</div>
                    <div className={cx(S.parameter, S.parameterButtons)}>
                        <div className={S.editButton} onClick={() => setEditingParameterId(parameter.id)}>
                            <Icon name="pencil" />
                            <span className="ml1">Edit</span>
                        </div>
                        <div className={S.removeButton} onClick={() => remove()}>
                            <Icon name="close" />
                            <span className="ml1">Remove</span>
                        </div>
                    </div>
                </div>
            );
        }
    }
}
