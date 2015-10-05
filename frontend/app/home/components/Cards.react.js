import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import IconBorder from 'metabase/components/IconBorder.react';
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";

import { fetchCards } from "../actions";


export default class Cards extends Component {

    constructor() {
        super();
        this.state = { error: null };
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
            <ul className="pt2 ml1">
                {items.map(item =>
                    <li key={item.id} className="flex pt2">
                        <div className="pb2 mr2">
                            <img style={{height: "36px"}} src={"/app/components/icons/assets/" + item.icon + ".png"} />
                        </div>
                        <div className="flex align-center flex-full border-bottom pb2">
                            <div className="text-brand-hover">
                                <a className="link mb2" href={'/card/'+item.id+'?clone'}>{item.name}</a>
                                <div className="text-grey-3">{item.description || "No description yet"}</div>
                            </div>
                            <div className="flex-align-right flex-full text-right text-grey-3">
                                <div>Saved by <span className="text-dark">{item.creator.common_name}</span></div>
                                <div>Created {item.created_at.fromNow()}</div>
                            </div>
                            <div className="flex-align-right text-right text-grey-3 ml2">
                                <a href={'/card/'+item.id} className="flex-align-right flex text-grey-1 text-grey-3-hover" title="Edit this question">
                                    <IconBorder>
                                        <Icon name='pencil' width={16} height={16}></Icon>
                                    </IconBorder>
                                </a>
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

Cards.propTypes = {
    dispatch: PropTypes.func.isRequired,
    databaseMetadata: PropTypes.object.isRequired,
    cards: PropTypes.array.isRequired,
    cardsFilter: PropTypes.object.isRequired
}
