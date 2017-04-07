import React, {Component, PropTypes} from "react";
import {Link} from "react-router";

import * as Urls from "metabase/lib/urls";
const LIST_ITEM_CLASSES = "relative block p4 hover-parent hover--visibility cursor-pointer text-centered transition-background";

const DashboardListItem = ({dashboard}) =>
    <li key={dashboard.id} className="mr4 mb4">
        <div className={LIST_ITEM_CLASSES}
             style={{
                 width: 290,
                 height: 180,
                 borderRadius: 10,
                 backgroundColor: '#fafafa'
             }}>
            <Link to={Urls.dashboard(dashboard.id)}
                  data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + dashboard.id}>
                <div>
                    {dashboard.name}
                </div>
                { dashboard.description ?
                    <div>
                        {dashboard.description}
                    </div>
                    : null }
            </Link>
        </div>
    </li>

export default class DashboardList extends Component {
    static propTypes = {
        dashboards: PropTypes.array.isRequired
    };

    render() {
        const {dashboards} = this.props;

        return (
            <ol className="flex flex-wrap">
                { dashboards.map(dash => <DashboardListItem dashboard={dash}/>)}
            </ol>
        );
    }
}