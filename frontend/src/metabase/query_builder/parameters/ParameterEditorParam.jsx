/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import ParameterTypePicker from "./ParameterTypePicker.jsx";
import Icon from "metabase/components/Icon.jsx";
import Input from "metabase/components/Input.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Select from "metabase/components/Select.jsx";
import { PARAMETER_OPTIONS } from "metabase/meta/Dashboard";
import _ from "underscore";

export default class ParameterEditorParam extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {};
    }

    static propTypes = {
        parameter: PropTypes.object.isRequired,
        onUpdate: PropTypes.func.isRequired
    };

    setParameterAttribute(attr, val) {
        // only register an update if the value actually changes
        if (this.props.parameter[attr] !== val) {
            this.props.onUpdate({
                ...this.props.parameter,
                [attr]: val
            });
        }
    }

    setRequired(val) {
        if (this.props.parameter.required !== val) {
            this.props.onUpdate({
                ...this.props.parameter,
                required: val,
                default: undefined
            });
        }
    }

    render() {
        const { parameter } = this.props;

        return (
            <div className="pb2 mb2 border-bottom border-dark">
                <h3 className="pb1">{parameter.name}</h3>

                <div className="pb2">
                    <h5 className="pb1 text-normal">Label</h5>
                    <input
                        type="text"
                        defaultValue={parameter.label}
                        className="p1 text-bold text-grey-4 bordered border-med rounded full"
                        onKeyUp={(e) => {
                            if (e.keyCode === 13) {
                                e.target.blur();
                            }
                        }}
                        onBlur={(e) => this.setParameterAttribute("label", e.target.value)}
                    />
                </div>

                <div className="pb2">
                    <h5 className="pb1 text-normal">Type</h5>
                    <PopoverWithTrigger
                        ref="popover"
                        triggerElement={
                            <input
                                type="text"
                                value={parameter.type ? _.findWhere(PARAMETER_OPTIONS, { type: parameter.type }).name : "Pick a type..."}
                                className="p1 text-bold text-grey-4 bordered border-med rounded full cursor-pointer"
                            />
                        }
                    >
                        <ParameterTypePicker
                            onChange={(opt) => {
                                this.setParameterAttribute("type", opt.type);
                                this.refs.popover.close();
                            }}
                        />
                    </PopoverWithTrigger>
                </div>

                <div className="flex align-center pb2">
                    <h5 className="text-normal mr1">Required?</h5>
                    <Toggle value={parameter.required} onChange={(value) => this.setRequired(value)} />
                </div>

                { parameter.required &&
                    <div className="pb2">
                        <h5 className="pb1 text-normal">Default Value</h5>
                        <input
                            type="text"
                            defaultValue={parameter.default}
                            className="p1 text-bold text-grey-4 bordered border-med rounded full"
                            onKeyUp={(e) => {
                                if (e.keyCode === 13) {
                                    e.target.blur();
                                }
                            }}
                            onBlur={(e) => this.setParameterAttribute("default", e.target.value)}
                        />
                    </div>
                }
            </div>
        );
    }
}
