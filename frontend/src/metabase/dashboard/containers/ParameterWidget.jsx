import React, { Component, PropTypes } from 'react';
import { connect } from "react-redux";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";

import DateSingleWidget from "../components/parameters/widgets/DateSingleWidget.jsx";
import DateRangeWidget from "../components/parameters/widgets/DateRangeWidget.jsx";
import DateRelativeWidget from "../components/parameters/widgets/DateRelativeWidget.jsx";
import DateMonthYearWidget from "../components/parameters/widgets/DateMonthYearWidget.jsx";
import DateQuarterYearWidget from "../components/parameters/widgets/DateQuarterYearWidget.jsx";
import CategoryWidget from "../components/parameters/widgets/CategoryWidget.jsx";
import TextWidget from "../components/parameters/widgets/TextWidget.jsx";

import S from "./ParameterWidget.css";
import cx from "classnames";
import _ from "underscore";

import { getMappingsByParameter } from "../selectors";

const makeMapStateToProps = () => {
    const mapStateToProps = (state, props) => ({
        mappingsByParameter: getMappingsByParameter(state)
    });
    return mapStateToProps;
}

const mapDispatchToProps = {
};

const WIDGETS = {
    "date/single": DateSingleWidget,
    "date/range":  DateRangeWidget,
    "date/relative":  DateRelativeWidget,
    "date/month-year":  DateMonthYearWidget,
    "date/quarter-year":  DateQuarterYearWidget
}

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

    renderPopover(value, placeholder, setValue) {
        const { parameter, mappingsByParameter, editingParameter } = this.props;
        const isEditingParameter = editingParameter && editingParameter.id === parameter.id;

        const values = _.chain(mappingsByParameter[parameter.id])
            .map(_.values)
            .flatten()
            .map(m => m.values || [])
            .flatten()
            .sortBy(_.identity)
            .uniq(true)
            .value();

        let hasValue = value != null;

        let Widget = WIDGETS[parameter.type] || TextWidget;
        if (values.length > 0) {
            Widget = CategoryWidget;
        }

        if (Widget.noPopover) {
            return (
                <div className={cx(S.parameter, S.noPopover, { [S.selected]: hasValue })}>
                    <Widget value={value} values={values} setValue={setValue} isEditing={isEditingParameter} />
                    { hasValue &&
                        <Icon name="close" className="flex-align-right" onClick={(e) => {
                            if (hasValue) {
                                e.stopPropagation();
                                setValue(null);
                            }
                        }} />
                    }
                </div>
            );
        }

        return (
            <PopoverWithTrigger
                ref="valuePopover"
                triggerElement={
                    <div ref="trigger" className={cx(S.parameter, { [S.selected]: hasValue })}>
                        <div className="mr1">{ hasValue ? Widget.format(value) : placeholder }</div>
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
                <Widget value={value} values={values} setValue={setValue} onClose={() => this.refs.valuePopover.close()} />
            </PopoverWithTrigger>
        );
    }

    render() {
        const { className, parameter, parameterValue, parameters, isEditing, editingParameter, setEditingParameterId, setName, setValue, setDefaultValue, remove } = this.props;

        const isEditingDashboard = isEditing;
        const isEditingParameter = editingParameter && editingParameter.id === parameter.id;

        if (!isEditingDashboard) {
            return (
                <div className={cx(className, S.container)}>
                    <div className={S.name}>{parameter.name}</div>
                    {this.renderPopover(parameterValue, "Select...", (value) => setValue(value))}
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
                            <Icon name="pencil" width={12} height={12} className="ml1 text-brand cursor-pointer" onClick={() => this.setState({ isEditingName: true })} />
                        </div>
                    }
                    {this.renderPopover(parameter.default, "Pick a default value (optional)", (value) => setDefaultValue(value))}
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
