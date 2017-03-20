/* eslint "react/prop-types": "warn" */
import React, {Component, PropTypes} from "react"

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Icon from "metabase/components/Icon.jsx";

import DateSingleWidget from "./widgets/DateSingleWidget.jsx";
import DateRangeWidget from "./widgets/DateRangeWidget.jsx";
import DateRelativeWidget from "./widgets/DateRelativeWidget.jsx";
import DateMonthYearWidget from "./widgets/DateMonthYearWidget.jsx";
import DateQuarterYearWidget from "./widgets/DateQuarterYearWidget.jsx";
import CategoryWidget from "./widgets/CategoryWidget.jsx";
import TextWidget from "./widgets/TextWidget.jsx";

import S from "../../containers/ParameterWidget.css";

import cx from "classnames";

const WIDGETS = {
    "date/single": DateSingleWidget,
    "date/range": DateRangeWidget,
    "date/relative": DateRelativeWidget,
    "date/month-year": DateMonthYearWidget,
    "date/quarter-year": DateQuarterYearWidget,
}

export default class ParameterValueWidget extends Component {

    static propTypes = {
        parameter: PropTypes.object.isRequired,
        name: PropTypes.string,
        value: PropTypes.any,
        setValue: PropTypes.func.isRequired,
        placeholder: PropTypes.string,
        values: PropTypes.array,
        isEditing: PropTypes.bool,
        noReset: PropTypes.bool,
        commitImmediately: PropTypes.bool,
    };

    static defautProps = {
        values: [],
        isEditing: false,
        noReset: false,
        commitImmediately: false,
    };

    static getWidget(parameter, values) {
        if (values && values.length > 0) {
            return CategoryWidget;
        } else if (WIDGETS[parameter.type]) {
            return WIDGETS[parameter.type];
        } else {
            return TextWidget;
        }
    }

    constructor(props) {
        super(props);
        this.state = {isFocused: false}
    }

    render() {
        const {parameter, value, values, setValue, isEditing, placeholder, noReset, commitImmediately} = this.props;

        let hasValue = value != null;

        let Widget = ParameterValueWidget.getWidget(parameter, values);
        const self = this;

        function focusChanged(isFocused) {
            self.setState({isFocused})
        }

        function getWidgetIcon() {
            if (hasValue && !noReset) {
                return <Icon name="close" className="flex-align-right cursor-pointer" size={12} onClick={(e) => {
                            if (hasValue) {
                                e.stopPropagation();
                                setValue(null);
                            }
                        }}/>
            } else if (Widget.noPopover && self.state.isFocused) {
                return <Icon name="enterorreturn" className="flex-align-right" size={12}/>
            } else if (Widget.noPopover) {
                // TODO: Check if this empty space could be implemented with pure CSS
                return <Icon name="empty" className="flex-align-right cursor-pointer" size={12}/>
            } else if (!Widget.noPopover) {
                return <Icon name="chevrondown" className="flex-align-right" size={12}/>
            }
        }

        if (Widget.noPopover) {
            return (
                <div className={cx(S.parameter, S.noPopover, { [S.selected]: hasValue })}>
                    <Widget placeholder={placeholder} value={value} values={values} setValue={setValue}
                            isEditing={isEditing} commitImmediately={commitImmediately} focusChanged={focusChanged}/>
                    { getWidgetIcon() }
                </div>
            );
        } else {
            let placeholderText = isEditing ? "Select a default value…" : (placeholder || "Select…");

            return (
                <PopoverWithTrigger
                    ref="valuePopover"
                    triggerElement={
                    <div ref="trigger" className={cx(S.parameter, { [S.selected]: hasValue })}>
                        <div className="mr1 text-nowrap">{ hasValue ? Widget.format(value) : placeholderText }</div>
                        { getWidgetIcon() }
                    </div>
                }
                    target={() => this.refs.trigger} // not sure why this is necessary
                >
                    <Widget value={value} values={values} setValue={setValue}
                            onClose={() => this.refs.valuePopover.close()}/>
                </PopoverWithTrigger>
            );
        }
    }

}
