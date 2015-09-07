"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

import { fetchDatabases, setCardsFilter } from "../actions";
import AccordianItem from "./AccordianItem.react";
import TableListing from "./TableListing.react";


export default class CardFilters extends Component {

    constructor(props) {
        super(props);

        this.state = { error : null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchDatabases());
        } catch (error) {
            this.setState({ error });
        }
    }

    async databaseClicked(id) {
        if (this.props.cardsFilter.database !== id) {
            this.props.dispatch(setCardsFilter({database: id, table: null}));
        }
    }

    render() {
        let { databases, cardsFilter } = this.props;

        return (
            <div className="p2">
                <div className="text-brand clearfix pt2">
                    <Icon className="float-left" name={'filter'} width={36} height={36}></Icon>
                    <div>Filter saved questions</div>
                </div>
                <div className="bordered rounded bg-white">
                    <ul>
                        {databases.map(item =>
                            <li key={item.id} className="border-row-divider">
                                <AccordianItem isOpen={cardsFilter.database === item.id} itemId={item.id} onClickFn={(id) => this.databaseClicked(id)} title={item.name}>
                                    <TableListing {...this.props}></TableListing>
                                </AccordianItem>
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        );
    }
}
