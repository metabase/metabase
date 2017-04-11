/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import Toggle from "metabase/components/Toggle.jsx";
import Select, { Option } from "metabase/components/Select.jsx";
import ParameterValueWidget from "metabase/parameters/components/ParameterValueWidget.jsx";

import { parameterOptionsForField } from "metabase/meta/Dashboard";
import Field from "metabase/meta/metadata/Field";

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
                dimension: undefined,
                widget_type: undefined
            });
        }
    }

    setDimension(fieldId) {
        const { tag, onUpdate, databaseFields } = this.props;
        const dimension = ["field-id", fieldId];
        if (!_.isEqual(tag.dimension !== dimension)) {
            const field = _.findWhere(databaseFields, { id: fieldId });
            const options = parameterOptionsForField(new Field(field));
            let widget_type;
            if (tag.widget_type && _.findWhere(options, { type: tag.widget_type })) {
                widget_type = tag.widget_type;
            } else if (options.length > 0) {
                widget_type = options[0].type;
            }
            onUpdate({
                ...tag,
                dimension,
                widget_type
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

        let widgetOptions;
        if (tag.type === "dimension" && tag.dimension) {
            const field = _.findWhere(databaseFields, { id: tag.dimension[1] });
            if (field) {
                widgetOptions = parameterOptionsForField(new Field(field));
            }
        }

        return (
            <div className="pb2 mb2 border-bottom border-dark">
                <h3 className="pb2">{tag.name}</h3>

                <div className="pb1">
                    <h5 className="pb1 text-normal">Filter label</h5>
                    <input
                        type="text"
                        value={tag.display_name}
                        className="AdminSelect p1 text-bold text-grey-4 bordered border-med rounded full"
                        onChange={(e) => this.setParameterAttribute("display_name", e.target.value)}
                    />
                </div>

                <div className="pb1">
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

                { tag.type === "dimension" &&
                    <div className="pb1">
                        <h5 className="pb1 text-normal">Field</h5>
                        <Select
                            className="border-med bg-white block"
                            value={Array.isArray(tag.dimension) ? tag.dimension[1] : null}
                            onChange={(e) => this.setDimension(e.target.value)}
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

                { widgetOptions && widgetOptions.length > 0 &&
                    <div className="pb1">
                        <h5 className="pb1 text-normal">Widget</h5>
                        <Select
                            className="border-med bg-white block"
                            value={tag.widget_type}
                            onChange={(e) => this.setParameterAttribute("widget_type", e.target.value)}
                            isInitiallyOpen={!tag.widget_type}
                            placeholder="Select…"
                        >
                            {[{ name: "None", type: undefined }].concat(widgetOptions).map(widgetOption =>
                                <Option key={widgetOption.type} value={widgetOption.type}>
                                    {widgetOption.name}
                                </Option>
                            )}
                        </Select>
                    </div>
                }

                { tag.type !== "dimension" &&
                    <div className="flex align-center pb1">
                        <h5 className="text-normal mr1">Required?</h5>
                        <Toggle value={tag.required} onChange={(value) => this.setRequired(value)} />
                    </div>
                }

                { ((tag.type !== "dimension" && tag.required) || (tag.type === "dimension" || tag.widget_type)) &&
                    <div className="pb1">
                        <h5 className="pb1 text-normal">Default value</h5>
                        <ParameterValueWidget
                            parameter={{
                                type: tag.widget_type || (tag.type === "date" ? "date/single" : null)
                            }}
                            value={tag.default}
                            setValue={(value) => this.setParameterAttribute("default", value)}
                            className="AdminSelect p1 text-bold text-grey-4 bordered border-med rounded bg-white"
                            isEditing
                            commitImmediately
                        />
                    </div>
                }
            </div>
        );
    }
}
