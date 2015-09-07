"use strict";

import React, { Component, PropTypes } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";

import { setCardsFilter } from "../actions";


export default class TableListing extends Component {

    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    async tableClicked(id) {
        this.props.dispatch(setCardsFilter({database: this.props.cardsFilter.database, table: id}));
    }

    render() {
        let { databaseMetadata } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper loading={!databaseMetadata} error={error}>
            {() =>
                <ul className="pl4 pr2 pb1">
                    {databaseMetadata.tables.map(item =>
                        <li key={item.id} className="py1 text-brand-hover" onClick={() => (this.tableClicked(item.id))}>
                            {item.display_name}
                        </li>
                    )}
                </ul>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
