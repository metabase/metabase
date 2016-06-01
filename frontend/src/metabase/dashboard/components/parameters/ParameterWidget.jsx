import React, { Component, PropTypes } from 'react';

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";

import S from "./ParameterWidget.css";
import cx from "classnames";

export default class ParameterWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            value: ""
        };
    }

    static propTypes = {
        parameter: PropTypes.object
    };

    static defaultProps = {
        parameter: null,
    }

    renderPopover(value, placeholder, setValue) {
        let hasValue = value != null;
        return (
            <PopoverWithTrigger
                ref="valuePopover"
                triggerElement={
                    <div className={cx(S.parameter, { [S.selected]: hasValue })}>
                        <div className="mr1">{ hasValue ? value : placeholder }</div>
                        <Icon name={hasValue ? "close" : "chevrondown"} className="flex-align-right" onClick={(e) => {
                            e.stopPropagation();
                            setValue(null);
                        }}/>
                    </div>
                }
            >
                <div>
                    <div><input className="input m1" type="text" value={this.state.value} onChange={(e) => this.setState({ value: e.target.value })}/></div>
                    <div><button className="Button mx1 mb1" onClick={() => {
                        setValue(this.state.value || null);
                        this.refs.valuePopover.close();
                    }}>Apply</button></div>
                </div>
            </PopoverWithTrigger>
        );
    }

    render() {
        const { className, parameter, parameterValue, isEditing, editingParameter, setEditingParameterId, setName, setValue, setDefaultValue, remove } = this.props;

        const isEditingDashboard = isEditing;
        const isEditingParameter = editingParameter && editingParameter.id === parameter.id;
        const isDisabled = editingParameter != null && !isEditingParameter;

        if (!isEditingDashboard) {
            return (
                <div className={className}>
                    <div className={S.name}>{parameter.name}</div>
                    {this.renderPopover(parameterValue, "Select...", (value) => setValue(value))}
                </div>
            );
        } else if (isEditingParameter) {
            return (
                <div className={cx(className, "flex flex-column")}>
                    { this.state.isEditingName ?
                        <input
                            type="text"
                            className={cx(S.nameInput)}
                            value={parameter.name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={() => this.setState({ isEditingName: false })}
                            autoFocus
                        />
                    :
                        <div className={S.name}>
                            {parameter.name}
                            <Icon name="pencil" width={12} height={12} className="ml1 text-brand cursor-pointer" onClick={() => this.setState({ isEditingName: true })} />
                        </div>
                    }
                    {this.renderPopover(parameter.default, "Pick a default value (optional)", (value) => setDefaultValue(value))}
                </div>
            );
        } else if (isDisabled) {
            return (
                <div className={cx(className, "disabled")}>
                    <div className={S.name}>{parameter.name}</div>
                    {this.renderPopover(null, "Select...")}
                </div>
            )
        } else {
            return (
                <div className={cx(className)}>
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
