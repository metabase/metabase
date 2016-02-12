import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Urls from "metabase/lib/urls";

import { fetchCards } from "../actions";

export default class Cards extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = { error: null };
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        databaseMetadata: PropTypes.object.isRequired,
        cards: PropTypes.array.isRequired,
        cardsFilter: PropTypes.object.isRequired
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchCards('all'));
        } catch (error) {
            this.setState({ error });
        }
    }

    tableName(table_id) {
        const { databaseMetadata } = this.props;
        for (var tableIdx in databaseMetadata.tables) {
            if (databaseMetadata.tables[tableIdx].id === table_id) {
                return databaseMetadata.tables[tableIdx].display_name;
            }
        }

        return "";
    }

    renderCards(cards) {

        let items = cards.slice().sort((a, b) => b.created_at - a.created_at);

        return (
            <ul className="ml1">
                {items.map(item =>
                    <li key={item.id} className="flex pt2">
                        <div className="pb2 mr2">
                            <Icon name={'illustration-'+item.display} width={36} height={36} />
                        </div>
                        <div className="flex align-center flex-full border-bottom pb2">
                            <div className="text-brand-hover">
                                <a className="link mb2" href={Urls.card(item.id)}>{item.name}</a>
                                <div className="text-grey-3">{item.description || "No description yet"}</div>
                            </div>
                            <div className="flex-align-right flex-no-shrink text-right text-grey-3">
                                <div>Saved by <span className="text-dark">{item.creator.common_name}</span></div>
                                <div>Created {item.created_at.fromNow()}</div>
                            </div>
                        </div>
                    </li>
                )}
            </ul>
        );
    }

    render() {
        let { cards, cardsFilter, databaseMetadata } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper loading={!cards} error={error}>
            {() =>
                <div>
                    { cards.length === 0 ?
                        <div className="flex flex-column layout-centered pt4" style={{marginTop: '100px'}}>
                            <span className="QuestionCircle">?</span>
                            <div className="text-normal mt3 mb1 h2 text-bold">
                                { cardsFilter.database && cardsFilter.table ?
                                    "No questions have been saved against "+this.tableName(cardsFilter.table)+" yet."
                                : null}

                                { cardsFilter.database && !cardsFilter.table ?
                                    "No questions have been saved against "+databaseMetadata.name+" yet."
                                : null}

                                { !cardsFilter.database && !cardsFilter.table ?
                                    "You don't have any saved questions yet."
                                : null}
                            </div>
                        </div>
                    :
                        this.renderCards(cards)
                    }
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
