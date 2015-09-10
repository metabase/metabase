"use strict";

import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import Icon from "metabase/components/Icon.react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";

import { fetchActivity } from "../actions";
import ActivityDescription from "./ActivityDescription.react";
import ActivityItem from './ActivityItem.react';
import ActivityStory from './ActivityItem.react';

import Urls from "metabase/lib/urls";


export default class Activity extends Component {

    constructor() {
        super();
        this.state = { error: null, userColors: {} };

        this.colorClasses = ['bg-brand', 'bg-purple', 'bg-error', 'bg-green', 'bg-gold', 'bg-grey-2'];
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

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchActivity());
        } catch (error) {
            this.setState({ error });
        }
    }

    componentWillReceiveProps(nextProps) {
        // do a quick pass over the activity and make sure we've assigned colors to all users which have activity
        let { activity, user } = nextProps;
        let { userColors } = this.state;

        const colors = [1,2,3,4,5];
        const maxColorUsed = (_.isEmpty(userColors)) ? 0 : _.max(_.values(userColors));
        var currColor =  (maxColorUsed && maxColorUsed < colors.length) ? maxColorUsed : 0;

        for (var item of activity) {
            if (!(item.user_id in userColors)) {
                // assign the user a color
                if (item.user_id === user.id) {
                    userColors[item.user_id] = 0;
                } else if (item.user_id === null) {
                    // just skip this scenario, we handle this differently
                } else {
                    userColors[item.user_id] = colors[currColor];
                    currColor++;

                    // if we hit the end of the colors list then just go back to the beginning again
                    if (currColor >= colors.length) {
                        currColor = 0;
                    }
                }
            }
        }

        this.setState({
            'error': this.state.error,
            'userColors': userColors
        });
    }


    initialsCssClasses(user) {
        let { userColors } = this.state;

        if (user) {
            const userColorIndex = userColors[user.id];
            const colorCssClass = this.colorClasses[userColorIndex];
            const cssClasses = {
                'UserNick': true,
                'text-white': true
            };
            cssClasses[colorCssClass] = true;

            return cx(cssClasses);
        } else {
            return cx({
                'UserNick': true,
                'text-grey-1': true
            });
        }
    }

    renderActivity(activity) {
        return (
            <ul className="pt2 pb4 relative">
                {activity.map(item => {
                    const description = this.activityDescription(item, item.user);
                    return (
                        <li key={item.id} className="mt3">
                            <ActivityItem
                                item={item}
                                description={description}
                                userColors={this.initialsCssClasses(item.user)}
                            />
                            { description.body ? <ActivityStory story={description} /> : null }
                        </li>
                    )
                })}
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
                            <div className="flex flex-column layout-centered mt4">
                                <span className="QuestionCircle">!</span>
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
