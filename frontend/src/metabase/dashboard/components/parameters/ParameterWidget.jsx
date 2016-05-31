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

    render() {
        const { className, parameter, parameterValue, isEditing, isSelected, isValid, onNameChange, setParameterValue, setParameterDefaultValue, setEditingParameterId } = this.props;
        const { value } = this.state;
        const hasValue = parameterValue != null;
        const hasDefaultValue = parameter.default != null;
        return (
            <div className={className}>
                { isEditing && isSelected && <div className="mb1">Give your filter a label</div>}
                { isEditing && isSelected ?
                    <div className={cx(S.parameter, { [S.selected]: true, [S.invalid]: !isValid })}>
                        <input
                            type="text"
                            value={parameter.name}
                            onChange={(e) => onNameChange(e.target.value)}
                            autoFocus
                        />
                    </div>
                : isEditing && !isSelected ?
                    <div className={cx(S.parameter, { [S.selected]: false, [S.invalid]: !isValid })} onClick={() => setEditingParameterId(parameter.id)}>
                        {parameter.name}
                    </div>
                :
                    <PopoverWithTrigger
                        ref="valuePopover"
                        triggerElement={
                            <div className={cx(S.parameter, { [S.selected]: hasValue, [S.hasValue]: hasValue })}>
                                { hasValue ?
                                    parameterValue
                                : hasDefaultValue ?
                                    parameter.default
                                :
                                    (isEditing ? "Pick a default value (optional)" : "Select...")
                                }
                                <Icon name={hasValue ? "close" : "chevrondown"} className="flex-align-right" onClick={(e) => {
                                    e.stopPropagation();
                                    if (isEditing) {
                                        setParameterDefaultValue(parameter.id, null);
                                    } else {
                                        setParameterValue(parameter.id, null);
                                    }
                                }}/>
                            </div>
                        }
                    >
                        <div>
                            <div><input className="input m1" type="text" value={value} onChange={(e) => this.setState({ value: e.target.value })}/></div>
                            <div><button className="Button mx1 mb1" onClick={() => {
                                if (isEditing) {
                                    setParameterDefaultValue(parameter.id, value || null);
                                } else {
                                    setParameterValue(parameter.id, value || null);
                                }
                                this.refs.valuePopover.close();
                            }}>Apply</button></div>
                        </div>
                    </PopoverWithTrigger>
                }
            </div>
        );
    }
}
