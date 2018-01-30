/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import SearchInput from "./SearchInput";

import { MetabaseApi } from "metabase/services";
import { singularize } from "metabase/lib/formatting"

import { addRemappings } from "metabase/redux/metadata";

import Field from "metabase-lib/lib/metadata/Field";

const MAX_SEARCH_RESULTS = 100;

const mapDispatchToProps = {
    addRemappings
};

type Props = {
    className?: string,

    value: any,
    onChange: () => void,

    autoFocus?: boolean,
    placeholder?: string,
    onFocus?: () => void,
    onBlur?: () => void,

    field: ?Field,
    searchField: ?Field,
    maxResults?: number,
};

@connect(null, mapDispatchToProps)
export default class FieldSearchInput extends Component {
    props: Props;

    static defaultProps = {
        maxResults: MAX_SEARCH_RESULTS
    };

    search = async (value: String, cancelled: Promise<void>) => {
        const { field, searchField, maxResults } = this.props;

        if (!field || !searchField || !value) {
            return;
        }

        const fieldId = (field.target || field).id;
        const searchFieldId = searchField.id;
        let results = await MetabaseApi.field_search(
            {
                value,
                fieldId,
                searchFieldId,
                limit: maxResults
            },
            { cancelled }
        );

        if (results && field !== searchField) {
            // $FlowFixMe: addRemappings provided by @connect
            this.props.addRemappings(field.id, results);
        }
        return results;
    };

    render() {
        const { field, searchField, isFocused } = this.props;
        let { placeholder } = this.props;
        if (isFocused && searchField && field !== searchField && field.isID()) {
            placeholder = singularize(searchField.table.display_name) + " ID or " + searchField.display_name;
        }
        return (
            <SearchInput
                {...this.props}
                search={this.search}
                placeholder={placeholder}
            />
        );
    }
}
