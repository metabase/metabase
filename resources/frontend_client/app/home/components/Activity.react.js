"use strict";

import React, { Component, PropTypes } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import { fetchActivity } from "../actions";


export default class Activity extends Component {

    constructor() {
        super();
        this.state = { error: null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchActivity());
        } catch (error) {
            this.setState({ error });
        }
    }

    renderActivity(activity) {

        // colors for each user
        // do we show user initials or the MB user icon

        return (
            <div>
            {activity.map(item =>
                <div key={item.id} className="ActivityItem">
                    user = {item.user}, {item.topic}
                </div>
            )}
            </div>
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
