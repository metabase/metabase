import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import Urls from "metabase/lib/urls";

import { fetchRecentViews } from "../actions";


export default class RecentViews extends Component {

    constructor(props) {
        super(props);

        this.state = { error : null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchRecentViews());
        } catch (error) {
            this.setState({ error });
        }
    }

    render() {
        let { recentViews } = this.props;

        return (
            <div className="p2">
                <div className="text-brand clearfix pt2 pb2">
                    <Icon className="float-left" name={'clock'} width={18} height={18}></Icon>
                    <span className="pl1 h3">Recents</span>
                </div>
                <div className="rounded bg-white" style={{border: '1px solid #E5E5E5'}}>
                    {recentViews.length > 0 ?
                        <ul className="px3 py2">
                            {recentViews.map((item, index) =>
                                <li key={index} className="py1 ml1">
                                    <a className="link text-dark" href={Urls.modelToUrl(item.model, item.model_id)}>{item.model_object.name}</a>
                                </li>
                            )}
                        </ul>
                    :
                        <div className="flex flex-column layout-centered text-normal text-grey-2">
                            <span className="QuestionCircle mt4">!</span>
                            <p className="p3 text-centered text-grey-4">You haven't looked at any Dashboards or Questions recently?</p>
                        </div>
                    }
                </div>
            </div>
        );
    }
}

RecentViews.propTypes = {
    dispatch: PropTypes.func.isRequired,
    recentViews: PropTypes.array.isRequired
}
