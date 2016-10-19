/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import Toggle from "metabase/components/Toggle.jsx";
import Select, { Option } from "metabase/components/Select.jsx";
import ParameterValueWidget from "metabase/dashboard/components/parameters/ParameterValueWidget.jsx";

import _ from "underscore";

export default class TagEditorParam extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {};
    }

    static propTypes = {
        tag: PropTypes.object.isRequired,
        onUpdate: PropTypes.func.isRequired,
        databaseFields: PropTypes.array
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

    setRequired(required) {
        if (this.props.tag.required !== required) {
            this.props.onUpdate({
                ...this.props.tag,
                required: required,
                default: undefined
            });
        }
    }

    setType(type) {
        if (this.props.tag.type !== type) {
            this.props.onUpdate({
                ...this.props.tag,
                type: type,
                dimension: undefined
            });
        }
    }

    render() {
        const { tag, databaseFields } = this.props;

        let dabaseHasSchemas = false;
        if (databaseFields) {
            let schemas = _.chain(databaseFields).pluck("schema").uniq().value();
            dabaseHasSchemas = schemas.length > 1;
        }

        return (
            <div className="pb2 mb2 border-bottom border-dark">
                <h3 className="pb1">{tag.name}</h3>

                <div className="pb2">
                    <h5 className="pb1 text-normal">Filter label</h5>
                    <input
                        type="text"
                        value={tag.display_name}
                        className="AdminSelect p1 text-bold text-grey-4 bordered border-med rounded full"
                        onChange={(e) => this.setParameterAttribute("display_name", e.target.value)}
                    />
                </div>

                <div className="pb2">
                    <h5 className="pb1 text-normal">Variable type</h5>
                    <Select
                        className="border-med bg-white block"
                        value={tag.type}
                        onChange={(e) => this.setType(e.target.value)}
                        isInitiallyOpen={!tag.type}
                        placeholder="Select…"
                    >
                        <Option value="text">Text</Option>
                        <Option value="number">Number</Option>
                        <Option value="date">Date</Option>
                        <Option value="dimension">Field Filter</Option>
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
                        <h5 className="pb1 text-normal">Default value</h5>
                        <ParameterValueWidget
                            parameter={{
                                type: tag.type === "date" ? "date/single" : null
                            }}
                            value={tag.default}
                            setValue={(value) => this.setParameterAttribute("default", value)}
                            isEditing
                            commitImmediately
                        />
                    </div>
                }

                { tag.type === "dimension" &&
                    <div className="pb2">
                        <h5 className="pb1 text-normal">Field</h5>
                        <Select
                            className="border-med bg-white block"
                            value={Array.isArray(tag.dimension) ? tag.dimension[1] : null}
                            onChange={(e) => this.setParameterAttribute("dimension", ["field-id", e.target.value])}
                            searchProp="name"
                            searchCaseInsensitive
                            isInitiallyOpen={!tag.dimension}
                            placeholder="Select…"
                        >
                            {databaseFields && databaseFields.map(field =>
                                <Option key={field.id} value={field.id} name={field.name}>
                                    <div className="cursor-pointer">
                                        <div className="h6 text-bold text-uppercase text-grey-2">{dabaseHasSchemas && (field.schema + " > ")}{field.table_name}</div>
                                        <div className="h4 text-bold text-default">{field.name}</div>
                                    </div>
                                </Option>
                            )}
                        </Select>

                    </div>
                }
            </div>
        );
    }
}
