/* @flow */

import React, {Component, PropTypes} from "react";
import {Link} from "react-router";
import {withState} from "recompose";
import cx from "classnames";
import moment from "moment";

import * as Urls from "metabase/lib/urls";

import type {Dashboard} from "metabase/meta/types/Dashboard";
import Icon from "metabase/components/Icon.jsx";

type DashboardListItemType = {
    dashboard: Dashboard,
    hover: boolean,
    setHover: (boolean) => void
}

const enhance = withState('hover', 'setHover', false)
const DashboardListItem = enhance(({dashboard, hover, setHover}: DashboardListItemType) =>
    <li key={dashboard.id} className="Grid-cell flex-retain-width">
        <Link to={Urls.dashboard(dashboard.id)}
              data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + dashboard.id}
              className="flex align-center border-box p2 bg-white bg-brand-hover rounded hover-parent hover--display no-decoration"
              style={{
                  border: "1px solid rgba(220,225,228,0.50)",
                  boxShadow: "0 1px 3px 0 rgba(220,220,220,0.50)",
                  height: "80px"
              }}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}>
            <Icon name="dashboard"
                  className={cx("pr2", {"text-grey-1": !hover}, {"text-brand-darken": hover})} size={32}/>
            <div className={cx("flex-full flex-retain-width", {"text-white": hover})}>
                <h4 className="text-ellipsis text-nowrap overflow-hidden text-brand" style={{marginBottom: "0.2em"}}>{dashboard.name}</h4>
                <div className="text-small text-uppercase text-grey-3 text-bold">
                    {/* NOTE: Could these time formats be centrally stored somewhere? */}
                    {moment(dashboard.created_at).format('MMM D, YYYY')}
                </div>
            </div>
        </Link>
    </li>
);

export default class DashboardList extends Component {
    static propTypes = {
        dashboards: PropTypes.array.isRequired
    };

    render() {
        const {dashboards} = this.props;

        return (
            <ol className="Grid Grid--guttersXl Grid--1of2 large-Grid--1of3">
                { dashboards.map(dash => <DashboardListItem dashboard={dash}/>)}
            </ol>
        );
    }
}