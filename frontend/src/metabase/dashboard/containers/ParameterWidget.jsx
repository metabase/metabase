import React, { Component, PropTypes } from 'react';
import { connect } from "react-redux";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";
import Calendar from "metabase/components/Calendar.jsx";

import S from "./ParameterWidget.css";
import cx from "classnames";
import _ from "underscore";
import moment from "moment";

import { getMappingsByParameter } from "../selectors";

const makeMapStateToProps = () => {
    const mapStateToProps = (state, props) => ({
        mappingsByParameter: getMappingsByParameter(state)
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
        const { parameter, mappingsByParameter } = this.props;
        const values = _.chain(mappingsByParameter[parameter.id])
            .map(_.values)
            .flatten()
            .map(m => m.values || [])
            .flatten()
            .sortBy(_.identity)
            .uniq(true)
            .value();

        let hasValue = value != null;

        return (
            <PopoverWithTrigger
                ref="valuePopover"
                triggerElement={
                    <div ref="trigger" className={cx(S.parameter, { [S.selected]: hasValue })}>
                        <div className="mr1">{ hasValue ? value : placeholder }</div>
                        <Icon name={hasValue ? "close" : "chevrondown"} className="flex-align-right" onClick={(e) => {
                            if (hasValue) {
                                e.stopPropagation();
                                setValue(null);
                            }
                        }}/>
                    </div>
                }
                target={() => this.refs.trigger} // not sure why this is necessary
            >
                { parameter.widget === "datetime/single" ?
                    <div className="p1">
                        <Calendar
                            initial={value && moment(value)}
                            selected={value && moment(value)}
                            selectedEnd={value && moment(value)}
                            onChange={(start) => { setValue(start); this.refs.valuePopover.close(); }}
                        />
                    </div>
                : values.length > 0 ?
                    <ul className="scroll-y scroll-show" style={{ maxWidth: 200, maxHeight: 300 }}>
                        {values.map(value =>
                            <li
                                key={value}
                                className="px2 py1 bg-brand-hover text-white-hover cursor-pointer"
                                onClick={() => { setValue(value); this.refs.valuePopover.close(); }}
                            >
                                {value}
                            </li>
                        )}
                    </ul>
                :
                    <div className="flex flex-column">
                        <input
                            className="input m1"
                            type="text"
                            value={this.state.value}
                            onChange={(e) => this.setState({ value: e.target.value })}
                            onKeyUp={(e) => {
                                if (e.keyCode === 13) {
                                    setValue(this.state.value || null);
                                    this.refs.valuePopover.close();
                                }
                            }}
                            // autoFocus // FIXME: this causes the page to scroll
                        />
                        <button
                            className="Button mx1 mb1 full-width"
                            onClick={() => {
                                setValue(this.state.value || null);
                                this.refs.valuePopover.close();
                            }}
                        >
                            Apply
                        </button>
                    </div>
                }
            </PopoverWithTrigger>
        );
    }

    render() {
        const { className, parameter, parameterValue, parameters, isEditing, editingParameter, setEditingParameterId, setName, setValue, setDefaultValue, remove } = this.props;

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
                            className={cx(S.nameInput, { "border-error": _.any(parameters, (p) => p.name === parameter.name && p.id !== parameter.id) })}
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
