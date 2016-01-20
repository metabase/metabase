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

    activityHeader(item, user) {

        // this is a base to start with
        const description = {
            userName: this.userName(item.user, user),
            subject: "did some super awesome stuff thats hard to describe",
            subjectRefLink: null,
            subjectRefName: null,
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
                if(item.table) {
                    description.summary = (<span>saved a question about <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id)}>{item.table.display_name}</a></span>);
                } else {
                    description.summary = "saved a question";
                }
                break;
            case "card-delete":
                description.summary = "deleted a question";
                break;
            case "dashboard-create":
                description.summary = "created a dashboard";
                break;
            case "dashboard-delete":
                description.summary = "deleted a dashboard";
                break;
            case "dashboard-add-cards":
                if(item.model_exists) {
                    description.summary = (<span>added a question to the dashboard - <a className="link text-dark" href={Urls.dashboard(item.model_id)}>{item.details.name}</a></span>);
                } else {
                    description.summary = (<span>added a question to the dashboard - <span className="text-dark">{item.details.name}</span></span>);
                }
                break;
            case "dashboard-remove-cards":
                if(item.model_exists) {
                    description.summary = (<span>removed a question from the dashboard - <a className="link text-dark" href={Urls.dashboard(item.model_id)}>{item.details.name}</a></span>);
                } else {
                    description.summary = (<span>removed a question from the dashboard - <span className="text-dark">{item.details.name}</span></span>);
                }
                break;
            case "database-sync":
                // NOTE: this is a relic from the very early days of the activity feed when we accidentally didn't
                //       capture the name/description/engine of a Database properly in the details and so it was
                //       possible for a database to be deleted and we'd lose any way of knowing what it's name was :(
                const oldName = (item.database && 'name' in item.database) ? item.database.name : "Unknown";
                if(item.details.name) {
                    description.summary = (<span>received the latest data from <span className="text-dark">{item.details.name}</span></span>);
                } else {
                    description.summary = (<span>received the latest data from <span className="text-dark">{oldName}</span></span>);
                }
                break;
            case "install":
                description.userName = "Hello World!";
                description.summary = "Metabase is up and running.";
                break;
            case "metric-create":
                if(item.model_exists) {
                    description.summary = (<span>added the metric <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id, item.model_id)}>{item.details.name}</a> to the <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id)}>{item.table.display_name}</a> table</span>);
                } else {
                    description.summary = (<span>added the metric <span className="text-dark">{item.details.name}</span></span>);
                }
                break;
            case "metric-update":
                if(item.model_exists) {
                    description.summary = (<span>made changes to the metric <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id, item.model_id)}>{item.details.name}</a> in the <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id)}>{item.table.display_name}</a> table</span>);
                } else {
                    description.summary = (<span>made changes to the metric <span className="text-dark">{item.details.name}</span></span>);
                }
                break;
            case "metric-delete":
                description.summary = "removed the metric "+item.details.name;
                break;
            case "pulse-create":
                description.summary = "created a pulse";
                break;
            case "pulse-delete":
                description.summary = "deleted a pulse";
                break;
            case "segment-create":
                if(item.model_exists) {
                    description.summary = (<span>added the filter <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id, null, item.model_id)}>{item.details.name}</a> to the <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id)}>{item.table.display_name}</a> table</span>);
                } else {
                    description.summary = (<span>added the filter <span className="text-dark">{item.details.name}</span></span>);
                }
                break;
            case "segment-update":
                if(item.model_exists) {
                    description.summary = (<span>made changes to the filter <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id, null, item.model_id)}>{item.details.name}</a> in the <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id)}>{item.table.display_name}</a> table</span>);
                } else {
                    description.summary = (<span>made changes to the filter <span className="text-dark">{item.details.name}</span></span>);
                }
                break;
            case "segment-delete":
                description.summary = "removed the filter "+item.details.name;
                break;
            case "user-joined":
                description.summary = "joined!";
                break;
        };

        return description;
    }

    activityStory(item) {

        // this is a base to start with
        const description = {
            body: null,
            bodyLink: null
        };

        switch (item.topic) {
            case "card-create":
            case "card-update":
                description.body = item.details.name;
                description.bodyLink = (item.model_exists) ? Urls.modelToUrl(item.model, item.model_id) : null;
                break;
            case "card-delete":
                description.body = item.details.name;
                break;
            case "dashboard-create":
                description.body = item.details.name;
                description.bodyLink = (item.model_exists) ? Urls.modelToUrl(item.model, item.model_id) : null;
                break;
            case "dashboard-delete":
                description.body = item.details.name;
                break;
            case "dashboard-add-cards":
                description.body = item.details.dashcards[0].name;
                description.bodyLink = Urls.card(item.details.dashcards[0].card_id);
                break;
            case "dashboard-remove-cards":
                description.body = item.details.dashcards[0].name;
                description.bodyLink = Urls.card(item.details.dashcards[0].card_id);
                break;
            case "metric-create":
                description.body = item.details.description;
                break;
            case "metric-update":
                description.body = item.details.revision_message;
                break;
            case "metric-delete":
                description.body = item.details.revision_message;
                break;
            case "pulse-create":
                description.body = item.details.name;
                description.bodyLink = (item.model_exists) ? Urls.modelToUrl(item.model, item.model_id) : null;
                break;
            case "pulse-delete":
                description.body = item.details.name;
                break;
            case "segment-create":
                description.body = item.details.description;
                break;
            case "segment-update":
                description.body = item.details.revision_message;
                break;
            case "segment-delete":
                description.body = item.details.revision_message;
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
                                            description={this.activityHeader(item, user)}
                                            userColors={this.initialsCssClasses(item.user)}
                                        />
                                        <ActivityStory story={this.activityStory(item)} />
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
