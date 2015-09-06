"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import Urls from "metabase/lib/urls";

import { fetchActivity } from "../actions";


export default class Activity extends Component {

    constructor() {
        super();
        this.state = { error: null };

        this.styles = {
            modelLink: {
                borderWidth: "2px"
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

    renderActivity(activity) {

        // colors for each user
        // do we show user initials or the MB user icon

        return (
            <ul className="pt2 pb4">
                {activity.map(item =>
                    <li key={item.id} className="flex pt2">
                        <div className="mr3">
                            <Icon name={'filter'} width={36} height={36}></Icon>
                        </div>
                        <div className="flex-full">
                            <div className="">
                                <div className="float-left text-grey-4">
                                    <span className="text-dark">{item.user.common_name}</span>
                                    &nbsp;{item.activityDescription()}&nbsp;
                                    { item.table ?
                                        <a className="link text-dark" href={Urls.tableRowsQuery(item.database_id, item.table_id)}>{item.table.display_name}</a>
                                    :
                                        null
                                    }
                                </div>
                                <div className="text-right text-grey-2">
                                    {item.timestamp.fromNow()}
                                </div>
                            </div>
                            { item.hasLinkableModel() ?
                                <div style={this.styles.modelLink} className="bordered rounded p2 mt1">
                                    <a className="link" href={Urls.modelToUrl(item.model, item.model_id)}>{item.details.name}</a>
                                </div>
                            :
                                null
                            }
                        </div>
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
