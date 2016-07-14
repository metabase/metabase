/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import TagTypePicker from "./TagTypePicker.jsx";
import Icon from "metabase/components/Icon.jsx";
import Input from "metabase/components/Input.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import { PARAMETER_OPTIONS } from "metabase/meta/Dashboard";
import _ from "underscore";


import Select, { Option } from "metabase/components/Select.jsx";

export default class TagEditorParam extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {};
    }

    static propTypes = {
        tag: PropTypes.object.isRequired,
        onUpdate: PropTypes.func.isRequired
    };

    setParameterAttribute(attr, val) {
        // only register an update if the value actually changes
        if (this.props.tag[attr] !== val) {
            this.props.onUpdate({
                ...this.props.tag,
                [attr]: val
            });
        }
    }

    setRequired(val) {
        if (this.props.tag.required !== val) {
            this.props.onUpdate({
                ...this.props.tag,
                required: val,
                default: undefined
            });
        }
    }

    render() {
        const { tag } = this.props;

        return (
            <div className="pb2 mb2 border-bottom border-dark">
                <h3 className="pb1">{tag.name}</h3>

                <div className="pb2">
                    <h5 className="pb1 text-normal">Filter label</h5>
                    <input
                        type="text"
                        defaultValue={tag.display_name}
                        className="AdminSelect p1 text-bold text-grey-4 bordered border-med rounded full"
                        onKeyUp={(e) => {
                            if (e.keyCode === 13) {
                                e.target.blur();
                            }
                        }}
                        onBlur={(e) => this.setParameterAttribute("display_name", e.target.value)}
                    />
                </div>

                <div className="pb2">
                    <h5 className="pb1 text-normal">Variable type</h5>
                    <Select className="border-med bg-white block" value={tag.type} onChange={(e) => this.setParameterAttribute("type", e.target.value)}>
                        <Option value="" disabled>Select a tag type</Option>
                        <Option value="text">Text</Option>
                        <Option value="number">Number</Option>
                        <Option value="date">Date</Option>
                        <Option value="dimension">Dimension</Option>
                    </Select>
                </div>

                { tag.type !== "dimension" &&
                    <div className="flex align-center pb2">
                        <h5 className="text-normal mr1">Required?</h5>
                        <Toggle value={tag.required} onChange={(value) => this.setRequired(value)} />
                    </div>
                }

                { tag.type !== "dimension" && tag.required &&
                    <div className="pb2">
                        <h5 className="pb1 text-normal">Default Value</h5>
                        <input
                            type="text"
                            defaultValue={tag.default}
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

                { tag.type === "dimension" &&
                    <div className="pb2">
                        <h5 className="pb1 text-normal">Field</h5>
                        <select className="Select" value={tag.type} onChange={(e) => this.setParameterAttribute("dimension", e.target.value)}>
                            <option value="" disabled>Select a field</option>
                        </select>
                    </div>
                }
            </div>
        );
    }
}
