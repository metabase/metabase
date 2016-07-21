import React, { Component, PropTypes } from 'react';
import cx from "classnames";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

// TODO: since these are shared we should probably find somewhere else to keep them
import DateMonthYearWidget from "metabase/dashboard/components/parameters/widgets/DateMonthYearWidget.jsx";
import DateQuarterYearWidget from "metabase/dashboard/components/parameters/widgets/DateQuarterYearWidget.jsx";
import DateRangeWidget from "metabase/dashboard/components/parameters/widgets/DateRangeWidget.jsx";
import DateRelativeWidget from "metabase/dashboard/components/parameters/widgets/DateRelativeWidget.jsx";
import DateSingleWidget from "metabase/dashboard/components/parameters/widgets/DateSingleWidget.jsx";
import CategoryWidget from "metabase/dashboard/components/parameters/widgets/CategoryWidget.jsx";
import TextWidget from "metabase/dashboard/components/parameters/widgets/TextWidget.jsx";


export default class TagValuePicker extends Component {

    static propTypes = {
        parameter: PropTypes.object.isRequired,
        value: PropTypes.any,
        values: PropTypes.array,
        setValue: PropTypes.func.isRequired
    };

    static defaultProps = {
        value: null,
        values: []
    };

    determinePickerComponent(type, numValues) {
        switch(type) {
            case null:                return UnknownWidget;
            case "date/month-year":   return DateMonthYearWidget;
            case "date/quarter-year": return DateQuarterYearWidget;
            case "date/range":        return DateRangeWidget;
            case "date/relative":     return DateRelativeWidget;
            case "date/single":       return DateSingleWidget;
            default:                  if (numValues > 0) {
                                          return CategoryWidget;
                                      } else {
                                          return TextWidget;
                                      }
        }
    }

    render() {
        const { parameter, setValue, value, values } = this.props;
        const hasValue = value != null;
        const placeholder = "Select…";

        // determine the correct Picker to render based on the parameter data type
        const PickerComponent = this.determinePickerComponent(parameter.type, values.length);

        if (PickerComponent.noPopover) {
            let classNames = cx("px1 flex align-center bordered border-med rounded TagValuePickerNoPopover", {
                "text-bold": hasValue,
                "text-grey-4": !hasValue,
                "text-brand": hasValue,
                "border-brand": hasValue,
                "TagValuePickerNoPopover--selected": hasValue
            });
            return (
                <div style={{paddingTop: "0.25rem", paddingBottom: "0.25rem"}} className={classNames}>
                    <PickerComponent value={value} values={values} setValue={setValue} />
                    { hasValue &&
                        <Icon name="close" className="flex-align-right cursor-pointer" onClick={(e) => {
                            if (hasValue) {
                                e.stopPropagation();
                                setValue(null);
                            }
                        }} />
                    }
                </div>
            );
        }

        let classNames = cx("p1 flex align-center bordered border-med rounded", {
            "text-bold": hasValue,
            "text-grey-4": !hasValue,
            "text-brand": hasValue,
            "border-brand": hasValue
        });
        return (
            <PopoverWithTrigger
                ref="valuePopover"
                triggerElement={
                    <div ref="trigger" style={{minHeight: 36, minWidth: 150}} className={classNames}>
                        <div className="mr1">{ hasValue ? PickerComponent.format(value) : placeholder }</div>
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
                <PickerComponent
                    value={value}
                    values={values}
                    setValue={setValue}
                    onClose={() => this.refs.valuePopover.close()}
                />
            </PopoverWithTrigger>
        );
    }
}

const UnknownWidget = () =>
    <input type="text" value="No type chosen" disabled={true} />
UnknownWidget.noPopover = true;
