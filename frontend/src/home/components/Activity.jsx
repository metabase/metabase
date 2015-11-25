import React, { Component, PropTypes } from 'react';
import _ from 'underscore';

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper.jsx';
import ActivityItem from './ActivityItem.jsx';
import ActivityStory from './ActivityStory.jsx';

import { fetchActivity } from '../actions';

import Urls from 'metabase/lib/urls';

export default class Activity extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = { error: null, userColors: {} };

        this.colorClasses = ['bg-brand', 'bg-purple', 'bg-error', 'bg-green', 'bg-gold', 'bg-grey-2'];
    }

    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        user: PropTypes.object.isRequired,
        activity: PropTypes.array.isRequired
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

        // this is a base to start with
        const description = {
            userName: this.userName(item.user, user),
            subject: "did some super awesome stuff thats hard to describe",
            subjectRefLink: null,
            subjectRefName: null,
            body: null,
            bodyLink: null,
            timeSince: item.timestamp.fromNow()
        };

        function handleSubject(item) {
            if(item.table) {
                return {
                    subject: "saved a question about",
                    subjectRefName: item.table.display_name,
                }
            } else {
                return {
                    subject: "saved a question",
                    subjectRefName: null
                }
            }
        }

        switch (item.topic) {
            case "card-create":
            case "card-update":
                description.subject = handleSubject(item).subject;
                description.subjectRefLink = Urls.tableRowsQuery(item.database_id, item.table_id);
                description.subjectRefName = handleSubject(item).subjectRefName;
                description.body = item.details.name;
                description.bodyLink = (item.model_exists) ? Urls.modelToUrl(item.model, item.model_id) : null;
                break;
            case "card-delete":
                description.subject = "deleted a question";
                description.body = item.details.name;
                break;
            case "dashboard-create":
                description.subject = "created a dashboard";
                description.body = item.details.name;
                description.bodyLink = (item.model_exists) ? Urls.modelToUrl(item.model, item.model_id) : null;
                break;
            case "dashboard-delete":
                description.subject = "deleted a dashboard";
                description.body = item.details.name;
                break;
            case "dashboard-add-cards":
                description.subject = "added a question to the dashboard -";
                description.subjectRefLink = (item.model_exists) ? Urls.dashboard(item.model_id) : null;
                description.subjectRefName = item.details.name;
                description.body = item.details.dashcards[0].name;
                description.bodyLink = Urls.card(item.details.dashcards[0].card_id);
                break;
            case "dashboard-remove-cards":
                description.subject = "removed a question from the dashboard -";
                description.subjectRefLink = (item.model_exists) ? Urls.dashboard(item.model_id) : null;
                description.subjectRefName = item.details.name;
                description.body = item.details.dashcards[0].name;
                description.bodyLink = Urls.card(item.details.dashcards[0].card_id);
                break;
            case "database-sync":
                // NOTE: this is a relic from the very early days of the activity feed when we accidentally didn't
                //       capture the name/description/engine of a Database properly in the details and so it was
                //       possible for a database to be deleted and we'd lose any way of knowing what it's name was :(
                const oldName = (item.database && 'name' in item.database) ? item.database.name : "Unknown";
                description.subject = "received the latest data from";
                description.subjectRefName = (item.details.name) ? item.details.name : oldName;
                break;
            case "install":
                description.userName = "Hello World!";
                description.subject = "Metabase is up and running.";
                break;
            case "pulse-create":
                description.subject = "created a pulse";
                description.body = item.details.name;
                description.bodyLink = (item.model_exists) ? Urls.modelToUrl(item.model, item.model_id) : null;
                break;
            case "pulse-delete":
                description.subject = "deleted a pulse";
                description.body = item.details.name;
                break;
            case "user-joined":
                description.subject = "joined!";
                break;
        };

        return description;
    }

    initialsCssClasses(user) {
        let { userColors } = this.state;

        if (user) {
            const userColorIndex = userColors[user.id];
            const colorCssClass = this.colorClasses[userColorIndex];

            return colorCssClass;
        }
    }

    render() {
        let { activity, user } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper loading={!activity} error={error}>
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
                            <ul className="pb4 relative">
                                {activity.map(item =>
                                    <li key={item.id} className="mt3">
                                        <ActivityItem
                                            item={item}
                                            description={this.activityDescription(item, user)}
                                            userColors={this.initialsCssClasses(item.user)}
                                        />
                                        <ActivityStory story={this.activityDescription(item, item.user)} />
                                    </li>
                                )}
                            </ul>
                        }
                    </div>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
