"use strict";

import React, { Component, PropTypes } from "react";

import Urls from "metabase/lib/urls";


export default class ActivityDescription extends Component {

    constructor(props) {
        super(props);

        this.styles = {
            modelLink: {
                borderWidth: "2px"
            }
        };
    }

    userName(user, currentUser) {
        if (user && user.id === currentUser.id) {
            return "You";
        } else if (user) {
            return user.first_name;
        } else {
            return "Metabase";
        }
    }

    activityDescription(item, user) {

        switch (item.topic) {
            case "card-create":
                return {
                    userName: this.userName(item.user, user),
                    subject: "saved a question about",
                    subjectRefLink: Urls.tableRowsQuery(item.database_id, item.table_id),
                    subjectRefName: item.table.display_name,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id),
                    timeSince: item.timestamp.fromNow()
                };
            case "card-update":
                return {
                    userName: this.userName(item.user, user),
                    subject: "saved a question about",
                    subjectRefLink: Urls.tableRowsQuery(item.database_id, item.table_id),
                    subjectRefName: item.table.display_name,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id),
                    timeSince: item.timestamp.fromNow()
                };
            case "card-delete":
                return {
                    userName: this.userName(item.user, user),
                    subject: "deleted a question",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id),
                    timeSince: item.timestamp.fromNow()
                };
            case "dashboard-create":
                return {
                    userName: this.userName(item.user, user),
                    subject: "created a dashboard",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id),
                    timeSince: item.timestamp.fromNow()
                };
            case "dashboard-delete":
                return {
                    userName: this.userName(item.user, user),
                    subject: "deleted a dashboard",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id),
                    timeSince: item.timestamp.fromNow()
                };
            case "dashboard-add-cards":
                return {
                    userName: this.userName(item.user, user),
                    subject: "added a question to the dashboard -",
                    subjectRefLink: Urls.dashboard(item.model_id),
                    subjectRefName: item.details.name,
                    body: item.details.dashcards[0].name,
                    bodyLink: Urls.card(item.details.dashcards[0].card_id),
                    timeSince: item.timestamp.fromNow()
                };
            case "dashboard-remove-cards":
                return {
                    userName: this.userName(item.user, user),
                    subject: "removed a question from the dashboard -",
                    subjectRefLink: Urls.dashboard(item.model_id),
                    subjectRefName: item.details.name,
                    body: item.details.dashcards[0].name,
                    bodyLink: Urls.card(item.details.dashcards[0].card_id),
                    timeSince: item.timestamp.fromNow()
                };
            case "database-sync":
                return {
                    userName: this.userName(item.user, user),
                    subject: "received the latest data from",
                    subjectRefLink: null,
                    subjectRefName: item.database.name,
                    body: null,
                    bodyLink: null,
                    timeSince: item.timestamp.fromNow()
                };
            case "user-joined":
                return {
                    userName: this.userName(item.user, user),
                    subject: "joined the party!",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: null,
                    bodyLink: null,
                    timeSince: item.timestamp.fromNow()
                };
            default: return "did some super awesome stuff thats hard to describe";
        };
    }

    render() {
        let { item, user } = this.props;
        const description = this.activityDescription(item, user);

        return (
            <div className="flex-full">
                <div className="">
                    <div className="float-left text-grey-4">
                        <span className="text-dark">{description.userName}</span>

                        &nbsp;{description.subject}&nbsp;

                        { description.subjectRefName && description.subjectRefLink ?
                            <a className="link text-dark" href={description.subjectRefLink}>{description.subjectRefName}</a>
                        : null }

                        { description.subjectRefName && !description.subjectRefLink ?
                            <span className="text-dark">{description.subjectRefName}</span>
                        : null }
                    </div>
                    <div className="text-right text-grey-2">
                        {description.timeSince}
                    </div>
                </div>
                { description.body ?
                    <div style={this.styles.modelLink} className="bordered rounded p2 mt1">
                        <a className="link" href={description.bodyLink}>{description.body}</a>
                    </div>
                :
                    null
                }
            </div>
        );
    }
}
