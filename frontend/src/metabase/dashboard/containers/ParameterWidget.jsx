import React, {Component, PropTypes} from 'react';
import {connect} from "react-redux";

import ParameterValueWidget from "../components/parameters/ParameterValueWidget.jsx";
import Icon from "metabase/components/Icon.jsx";

import S from "./ParameterWidget.css";
import cx from "classnames";
import _ from "underscore";

import FieldSet from "../../components/FieldSet";

import {getMappingsByParameter} from "../selectors";

const makeMapStateToProps = () => {
    const mapStateToProps = (state, props) => ({
        mappingsByParameter: getMappingsByParameter(state, props)
    });
    return mapStateToProps;
}

const mapDispatchToProps = {};


@connect(makeMapStateToProps, mapDispatchToProps)
export default class ParameterWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            isEditingName: false,
            isFocused: false
        };

        this.focusChanged = this.focusChanged.bind(this)
    }

    static propTypes = {
        parameter: PropTypes.object
    };

    static defaultProps = {
        parameter: null,
    }

    getValues() {
        const {parameter, mappingsByParameter} = this.props;
        return _.chain(mappingsByParameter[parameter.id])
            .map(_.values)
            .flatten()
            .map(m => m.values || [])
            .flatten()
            .sortBy(_.identity)
            .uniq(true)
            .value();
    }

    renderPopover(value, setValue, placeholder) {
        const {parameter, editingParameter} = this.props;
        const isEditingParameter = !!(editingParameter && editingParameter.id === parameter.id);
        const values = this.getValues();
        return (
            <ParameterValueWidget
                parameter={parameter}
                name={name}
                value={value}
                values={values}
                setValue={setValue}
                isEditing={isEditingParameter}
                placeholder={placeholder}
                focusChanged={this.focusChanged}
            />
        );
    }

    focusChanged(isFocused) {
        this.setState({isFocused})
    }

    render() {
        const {className, parameter, parameters, isEditing, isFullscreen, isQB, editingParameter, setEditingParameter, setName, setValue, setDefaultValue, remove} = this.props;

        const isEditingDashboard = isEditing;
        const isEditingParameter = editingParameter && editingParameter.id === parameter.id;

        const containerClassName = cx(S.container);
        const self = this;

        function renderFieldInNormalMode() {
            const fieldHasValueOrFocus = parameter.value != null || self.state.isFocused;
            const legend = fieldHasValueOrFocus ? parameter.name : "";

            return (
                <FieldSet legend={legend} noPadding={true}
                          className={cx(className, containerClassName, {"border-brand": fieldHasValueOrFocus})}>
                    {self.renderPopover(parameter.value, (value) => setValue(value), parameter.name)}
                </FieldSet>
            );
        }

        function renderEditFieldNameUI() {
            return (
                <FieldSet legend="" noPadding={true} className={cx(className, containerClassName)}>
                    <input
                        type="text"
                        className={cx(S.nameInput, { "border-error": _.any(parameters, (p) => p.name === parameter.name && p.id !== parameter.id) })}
                        value={parameter.name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => self.setState({ isEditingName: false })}
                        onKeyUp={(e) => {
                                if (e.keyCode === 27 || e.keyCode === 13) {
                                    e.target.blur();
                                }
                            }}
                        autoFocus
                    />
                </FieldSet>
            )
        }

        function renderSetDefaultFieldValueUI() {
            const editNameButton = (
                <span className={S.editNameIconContainer}>
                <Icon name="pencil" size={12} className="text-brand cursor-pointer"
                      onClick={() => self.setState({ isEditingName: true })}/>
                </span>
            )

            const legend = <span>{parameter.name} {editNameButton}</span>

            return (
                <FieldSet legend={legend} noPadding={true} className={cx(className, containerClassName)}>
                    {self.renderPopover(parameter.default, (value) => setDefaultValue(value), parameter.name)}
                </FieldSet>
            );
        }

        function renderFieldEditingButtons() {
            return (
                <FieldSet legend={parameter.name} noPadding={true} className={cx(className, containerClassName)}>
                    <div className={cx(S.parameter, S.parameterButtons)}>
                        <div className={S.editButton} onClick={() => setEditingParameter(parameter.id)}>
                            <Icon name="pencil"/>
                            <span className="ml1">Edit</span>
                        </div>
                        <div className={S.removeButton} onClick={() => remove()}>
                            <Icon name="close"/>
                            <span className="ml1">Remove</span>
                        </div>
                    </div>
                </FieldSet>
            );
        }

        if (isFullscreen) {
            if (parameter.value != null) {
                return <div style={{fontSize: "0.833em"}}>{renderFieldInNormalMode()}</div>;
            } else {
                return <span className="hide"/>;
            }
        } else if (!isEditingDashboard) {
            return renderFieldInNormalMode();
        } else if (isEditingParameter) {
            if (this.state.isEditingName) {
                return renderEditFieldNameUI()
            } else {
                return renderSetDefaultFieldValueUI()
            }
        } else {
            return renderFieldEditingButtons()
        }
    }
}
