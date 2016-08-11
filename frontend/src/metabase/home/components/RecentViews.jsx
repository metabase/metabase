import React, { Component, PropTypes } from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";
import SidebarSection from "./SidebarSection.jsx";
import Urls from "metabase/lib/urls";

export default class RecentViews extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = { error : null };
    }

    static propTypes = {
        fetchRecentViews: PropTypes.func.isRequired,
        recentViews: PropTypes.array.isRequired
    }

    static defaultProps = {
        recentViews: []
    }

    async componentDidMount() {
        try {
            await this.props.fetchRecentViews();
        } catch (error) {
            this.setState({ error });
        }
    }

    renderIllustration(item) {
        if (item.model === 'card' && 'display' in item.model_object) {
            return (
                <Icon name={'illustration-'+item.model_object.display} size={22} />
            );

        } else if(item.model === 'dashboard') {
            return (
                <Icon name={'illustration-dashboard'} size={22} />
            );

        } else {
            return null;
        }
    }

    render() {
        let { recentViews } = this.props;

        return (
            <SidebarSection title="Recently Viewed" icon="clock">
                {recentViews.length > 0 ?
                    <ul className="p2">
                        {recentViews.map((item, index) =>
                            <li key={index} className="py1 ml1 flex align-center clearfix">
                                {this.renderIllustration(item)}
                                <Link to={Urls.modelToUrl(item.model, item.model_id)} data-metabase-event={"Recent Views;"+item.model+";"+item.cnt} className="ml1 flex-full link">{item.model_object.name}</Link>
                            </li>
                        )}
                    </ul>
                :
                    <div className="flex flex-column layout-centered text-normal text-grey-2">
                        <p className="p3 text-centered text-grey-2" style={{ "maxWidth": "100%" }}>You haven't looked at any dashboards or questions recently</p>
                    </div>
                }
            </SidebarSection>
        );
    }
}
