import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";

import { fetchDatabases, setCardsFilter } from "../actions";
import AccordianItem from "./AccordianItem.react";
import TableListing from "./TableListing.react";


export default class CardFilters extends Component {

    constructor(props, context) {
        super(props, context);

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
        } else {
            // clicking an already open database closes it
            this.props.dispatch(setCardsFilter({database: null, table: null}));
        }
    }

    render() {
        let { databases, cardsFilter } = this.props;

        return (
            <div className="p2">
                <div className="text-dark-grey flex align-center py2">
                    <Icon className="inline-block" name={'filter'} width={18} height={18}></Icon>
                    <div className="pl1 Sidebar-header inline-block">Filter saved questions</div>
                </div>
                <div className="rounded bg-white" style={{border: '1px solid #E5E5E5'}}>
                    <ul className="cursor-pointer">
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

CardFilters.propTypes = {
    dispatch: PropTypes.func.isRequired,
    cardsFilter: PropTypes.object.isRequired,
    databases: PropTypes.array.isRequired
}
