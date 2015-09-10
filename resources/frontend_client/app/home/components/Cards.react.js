"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";

import { fetchCards } from "../actions";


export default class Cards extends Component {

    constructor() {
        super();
        this.state = { error: null };

        this.styles = {
            main: {
                marginRight: "346px"
            },
            mainWrapper: {
                width: "100%",
                margin: "0 auto",
                paddingLeft: "12em",
                paddingRight: "3em"
            },
            headerGreeting: {
                fontSize: "x-large"
            }
        };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchCards('all'));
        } catch (error) {
            this.setState({ error });
        }
    }

    renderCards(cards) {

        let items = cards.slice().sort((a, b) => b.created_at - a.created_at);

        return (
            <ul className="pt2">
                {items.map(item =>
                    <li key={item.id} className="flex pt2">
                        <div className="pb2 mr3">
                            <img style={{height: "36px"}} src={"/app/components/icons/assets/" + item.icon + ".png"} />
                        </div>
                        <div className="flex align-center flex-full border-bottom pb2">
                            <div className="text-brand-hover">
                                <a className="link mb2" href={'/card/'+item.id+'?clone'}>{item.name}</a>
                                <div className="text-grey-3">{item.description || "No description yet"}</div>
                            </div>
                            <div className="flex-align-right flex-full text-right text-grey-3">
                                <div className="mb1">Saved by <span className="text-dark">{item.creator.common_name}</span></div>
                                <div>Created {item.created_at.fromNow()}</div>
                            </div>
                            <div className="flex-align-right text-right text-grey-3 ml2">
                                <a href={'/card/'+item.id} className="flex-align-right IconCircle flex text-grey-1 text-grey-3-hover transition-color layout-centered">
                                    <Icon name={'pencil'} width={18} height={18}></Icon>
                                </a>
                            </div>
                        </div>
                    </li>
                )}
            </ul>
        );
    }

    render() {
        let { cards } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper loading={!cards} error={error}>
            {() =>
                <div>
                    { cards.length === 0 ?
                        <div className="flex flex-column layout-centered pt4">
                            <span className="QuestionCircle">?</span>
                            <div className="text-normal mt3 mb1">Hmmm, looks like you don't have any saved questions yet.</div>
                            <div className="text-normal text-grey-2">Save a question and get this baby going!</div>
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
