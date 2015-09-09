"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import Urls from "metabase/lib/urls";

import { fetchActivity } from "../actions";
import ActivityDescription from "./ActivityDescription.react";


export default class Activity extends Component {

    constructor() {
        super();
        this.state = { error: null };

        this.styles = {
            modelLink: {
                borderWidth: "2px"
            },

            initials: {
                borderStyle: "none"
            }
        }
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchActivity());
        } catch (error) {
            this.setState({ error });
        }
    }

    userInitials(user) {
        let initials = '??';

        if (user.first_name !== 'undefined') {
            initials = user.first_name.substring(0, 1);
        }

        if (user.last_name !== 'undefined') {
            initials = initials + user.last_name.substring(0, 1);
        }

        return initials;
    }

    activityDescription(item) {
        switch (item.topic) {
            case "card-create":
                return {
                    subject: "saved a question about",
                    subjectRefLink: Urls.tableRowsQuery(item.database_id, item.table_id),
                    subjectRefName: item.table.display_name,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id)
                };
            case "card-update":
                return {
                    subject: "saved a question about",
                    subjectRefLink: Urls.tableRowsQuery(item.database_id, item.table_id),
                    subjectRefName: item.table.display_name,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id)
                };
            case "card-delete":
                return {
                    subject: "deleted a question",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id)
                };
            case "dashboard-create":
                return {
                    subject: "created a dashboard",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id)
                };
            case "dashboard-delete":
                return {
                    subject: "deleted a dashboard",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: item.details.name,
                    bodyLink: Urls.modelToUrl(item.model, item.model_id)
                };
            case "dashboard-add-cards":
                return {
                    subject: "added a question to the dashboard -",
                    subjectRefLink: Urls.dashboard(item.model_id),
                    subjectRefName: item.details.name,
                    body: item.details.dashcards[0].name,
                    bodyLink: Urls.card(item.details.dashcards[0].card_id)
                };
            case "dashboard-card-delete": return "removed a question from the dashboard -";
            case "database-sync":
                return {
                    subject: "received the latest data from",
                    subjectRefLink: Urls.tableRowsQuery(item.database_id, item.table_id),
                    subjectRefName: item.table.display_name,
                    body: null,
                    bodyLink: null
                };
            case "user-joined":
                return {
                    subject: "joined the party!",
                    subjectRefLink: null,
                    subjectRefName: null,
                    body: null,
                    bodyLink: null
                };
            default: return "did some super awesome stuff thats hard to describe";
        };
    }

    renderActivity(activity) {

        // colors for each user
        // do we show user initials or the MB user icon

        return (
            <ul className="pt2 pb4">
                {activity.map(item =>
                    <li key={item.id} className="flex pt2">
                        <div className="mr3">
                            <span styles={this.styles.initials} className="UserNick">
                                <span className="UserInitials NavItem-text">{this.userInitials(item.user)}</span>
                            </span>
                        </div>
                        <ActivityDescription item={item} description={this.activityDescription(item)}></ActivityDescription>
                    </li>
                )}
            </ul>
        );
    }

    render() {
        let { activity } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper className="" loading={!activity} error={error}>
            {() =>
                <div className="full flex flex-column">
                    <div className="">
                        { activity.length === 0 ?
                            <div className="flex flex-column layout-centered">
                                <span className="QuestionCircle">?</span>
                                <div className="text-normal mt3 mb1">Hmmm, looks like nothing has happened yet.</div>
                                <div className="text-normal text-grey-2">Save a question and get this baby going!</div>
                            </div>
                        :
                            this.renderActivity(activity)
                        }
                    </div>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}

Activity.propTypes = {
    dispatch: PropTypes.func.isRequired,
    onChangeLocation: PropTypes.func.isRequired,
    onDashboardDeleted: PropTypes.func.isRequired,
    visualizationSettingsApi: PropTypes.object.isRequired
};
