/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import Input from "metabase/components/Input.jsx";
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
            let param = JSON.parse(JSON.stringify(this.props.parameter));
            param[attr] = val;
            this.props.onUpdate(param);
        }
    }

    render() {
        const { parameter } = this.props;

        //let { options } = _.findWhere(PARAMETER_OPTIONS, { id: section });

        return (
            <div className="pb2 border-bottom border-dark">
                <h3 className="pb1">{parameter.name}</h3>

                <div className="pb2">
                    <h5 className="pb1 text-normal">Label</h5>
                    <input type="text" defaultValue={parameter.label} className="Input full" onBlur={(e) => this.setParameterAttribute("label", e.target.value)} />
                </div>

                <div>
                    
                    <h5 className="pb1 text-normal">Type</h5>
                    <ParameterTypeSelect 
                        options={PARAMETER_OPTIONS} 
                        selectedValue={parameter.type || "id"} 
                        onChange={(opt) => this.setParameterAttribute("type", opt.type)}
                    />
                </div>
            </div>
        );
    }
}

const ParameterTypeSelect = ({ options, selectedValue, onChange }) =>
    <label className="Select mt1">
        <select className="Select" defaultValue={selectedValue} onChange={(e) => onChange(_.findWhere(options, {type: e.target.value}))}>
            {options.map(opt => <option key={opt.type} value={opt.type}>{opt.name}</option>)}
        </select>
    </label>
