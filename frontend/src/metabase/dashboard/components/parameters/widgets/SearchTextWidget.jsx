/* @flow */

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";

import Popover from "metabase/components/Popover";

import { MetabaseApi } from "metabase/services";
import { defer } from "metabase/lib/promise";

import { debounce } from "underscore";

import { getMetadata } from "metabase/dashboard/selectors";

import type { StructuredDatasetQuery } from "metabase/meta/types/Card";
import type { FieldId } from "metabase/meta/types/Field";

import Metadata from "metabase/meta/metadata/Metadata";

const MAX_SEARCH_RESULTS = 100;

const mapStateToProps = (state, props) => ({
    metadata: getMetadata(state, props)
});

type Props = {
    value: any,
    setValue: () => void,
    onClose: () => void,

    isEditing: bool,

    fieldId: FieldId,
    metadata: Metadata,
};

type State = {
    value: string,
    lastValue: ?string,
    suggestions: Array<[string, string]>,
    focused: bool,
};

const entityNameCache = {};
function setEntityName(fieldId, entityId, entityName) {
    entityNameCache[fieldId] = entityNameCache[fieldId] || {};
    entityNameCache[fieldId][entityId] = entityName;
}
function getEntityName(fieldId, entityId) {
    return entityNameCache[fieldId] && entityNameCache[fieldId][entityId];
}

@connect(mapStateToProps)
export default class SearchTextWidget extends Component<*, Props, State> {
    props: Props;
    state: State;

    _cancel: ?() => void;
    _input: ?any;

    constructor(props: Props) {
        super(props);
        this.state = {
            value: props.value || "",
            lastValue: null,
            suggestions: [],
            focused: false,
        };
    }

    static noPopover = true;

    static format(entityId, fieldId) {
        const entityName = fieldId != null ? getEntityName(fieldId, entityId) : null;
        if (entityName != null) {
            return (
                <span>
                    <span className="text-bold">{entityName}</span>
                    <span style={{ opacity: 0.5 }}>{" - " + entityId}</span>
                </span>
            );
        } else {
            return entityId;
        }
    }

    componentWillReceiveProps(nextProps: Props) {
        if (nextProps.value !== this.state.value) {
            this.setState({ value: nextProps.value || "" });
        }
    }

    _update(value: string) {
        if (this._cancel) {
            this._cancel();
        }
        this.setState({ value }, this._search);
    }

    // $FlowFixMe
    _search = debounce(async (): void => {
        const { metadata, fieldId } = this.props;
        const { value, lastValue, suggestions } = this.state;

        // if this search is just an extension of the previous search, and the previous search
        // wasn't truncated, then we don't need to do another search because TypeaheadListing
        // will filter the previous result client-side
        if (lastValue && value.slice(0, lastValue.length) === lastValue &&
            suggestions.length < MAX_SEARCH_RESULTS
        ) {
            return;
        }

        const valueField = metadata.field(fieldId);
        if (!valueField) {
            return;
        }

        const table = valueField.table();
        if (!table) {
            return;
        }

        const database = table.database();
        if (!database) {
            return;
        }

        const isEntityId = valueField.isID();

        let nameField;
        if (isEntityId) {
            // assumes there is only one entity name field
            nameField = table.fields().filter(f => f.isEntityName())[0];
        } else {
            nameField = valueField;
        }

        if (!nameField) {
            return;
        }

        const datasetQuery: StructuredDatasetQuery = {
            database: database.id,
            type: "query",
            query: {
                source_table: table.id,
                filter: ["starts-with",["field-id", nameField.id], value],
                breakout: [["field-id", valueField.id]],
                // order_by: [[["field-id", nameField.id], "ascending"]],
                fields: [
                    ["field-id", valueField.id],
                    ["field-id", nameField.id]
                ],
                limit: MAX_SEARCH_RESULTS,
            }
        }

        const cancelDeferred = defer();
        this._cancel = () => {
            this._cancel = null;
            cancelDeferred.resolve();
        }

        let result = await MetabaseApi.dataset(datasetQuery, { cancelled: cancelDeferred.promise });
        this._cancel = null;

        if (result && result.data && result.data.rows) {
            if (isEntityId) {
                for (const [entityId, entityName] of result.data.rows) {
                    setEntityName(fieldId, entityId, entityName)
                }
            }
            this.setState({
                suggestions: result.data.rows,
                lastValue: value
            });
        }
    }, 500)

    render() {
        const { setValue, isEditing } = this.props;
        const { suggestions, value } = this.state;

        if (!this.state.focused && this.props.value) {
            return (
                <div className="flex-full" onClick={() => this.setState({ focused: true })}>
                    {SearchTextWidget.format(this.props.value , this.props.fieldId)}
                </div>
            )
        }

        return (
            <div>
                <input
                    ref={i => this._input = i}
                    value={this.state.value}
                    onInput={(e) => this._update(e.target.value)}
                    onKeyUp={(e) => {
                        if (e.keyCode === 27) {
                            e.target.blur();
                        } else if (e.keyCode === 13) {
                            setValue(this.state.value || null);
                            e.target.blur();
                        }
                    }}
                    onFocus={() => this.setState({ focused: true })}
                    onBlur={() => this.setState({ focused: false })}
                    autoFocus={this.state.focused}
                    placeholder={isEditing ? "Enter a default value..." : "Enter a value..."}
                />
                <TypeaheadPopover
                    value={value}
                    options={suggestions}
                    onSuggestionAccepted={(suggestion) => {
                        setValue(suggestion[0]);
                        this.setState({ suggestions: [] });
                        if (this._input) {
                            ReactDOM.findDOMNode(this._input).blur();
                        }
                    }}
                />
            </div>
        );
    }
}

import Typeahead from "metabase/hoc/Typeahead";
import cx from "classnames";

const TypeaheadPopover = Typeahead({
    optionFilter: (value, option) => option[1].slice(0, value.length) === value,
    optionIsEqual: ([idA], [idB]) => idA === idB
})(({ value, suggestions, onSuggestionAccepted, selectedSuggestion }) =>
    suggestions && suggestions.length > 0 &&
        <Popover targetOffsetY={15} >
            <ul className="my1">
            { suggestions.map(suggestion =>
                <li
                    className={cx("bg-brand-hover text-white-hover p1 px2", {
                        "bg-brand text-white": selectedSuggestion && suggestion[0] === selectedSuggestion[0]
                    })}
                    onClick={() => onSuggestionAccepted(suggestion)}
                >
                    <span className="text-bold">{suggestion[1].slice(0, value.length)}</span>
                    <span>{suggestion[1].slice(value.length)}</span>
                    { suggestion[0] !== suggestion[1] &&
                        <span className="ml4 float-right text-bold text-grey-2">{suggestion[0]}</span>
                    }
                </li>
            )}
            </ul>
        </Popover>
)
