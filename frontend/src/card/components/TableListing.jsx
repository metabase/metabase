import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { setCardsFilter } from "../actions";

export default class TableListing extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = { error: null };
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        cardsFilter: PropTypes.object.isRequired,
        databaseMetadata: PropTypes.object.isRequired
    };

    tableClicked(id) {
        if (this.props.cardsFilter.table !== id) {
            this.props.dispatch(setCardsFilter({database: this.props.cardsFilter.database, table: id}));
        }
    }

    clearFilter() {
        this.props.dispatch(setCardsFilter({database: this.props.cardsFilter.database, table: null}));
    }

    render() {
        let { cardsFilter, databaseMetadata } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper loading={!databaseMetadata} error={error}>
            {() =>
                <ul className="pb1">
                    {databaseMetadata.tables.map(item =>
                        <li key={item.id} onClick={() => (this.tableClicked(item.id))}>
                            { item.id === cardsFilter.table ?
                                <div className="pl4 pr2 py1 bg-brand text-white">
                                    <span className="">{item.display_name}</span>
                                    <span className="float-right" onClick={() => (this.clearFilter())}>
                                        <Icon name={'close'} width={12} height={12}></Icon>
                                    </span>
                                </div>
                            :
                                <div className="pl4 pr2 py1 text-brand-hover">{item.display_name}</div>
                            }
                        </li>
                    )}
                </ul>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
