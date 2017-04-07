/* @flow */

import React, {Component, PropTypes} from "react";
import {Link} from "react-router";
import {withState} from "recompose";
import cx from "classnames";

import * as Urls from "metabase/lib/urls";

import type {Dashboard} from "metabase/meta/types/Dashboard";
import Icon from "metabase/components/Icon.jsx";

type DashboardListItemType = {
    dashboard: Dashboard,
    hover: boolean,
    setHover: (boolean) => void
}

const enhance = withState('hover', 'setHover', false)
const DashboardListItem = enhance(({ dashboard, hover, setHover }: DashboardListItemType) =>
    <li key={dashboard.id} className="Grid-cell flex-retain-width">
        <Link o={Urls.dashboard(dashboard.id)}
              data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + dashboard.id}
              className="block border-box p2 bg-white bg-brand-hover rounded hover-parent hover--display"
              style={{
                  border: "1px solid rgba(220,225,228,0.50)",
                  boxShadow: "0 1px 3px 0 rgba(220,220,220,0.50)",
                  height: "80px"
              }}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}>
            <div className="flex align-center">
                <Icon name="dashboard" className={cx({"text-grey-1": !hover}, {"text-brand-darken": hover})} size={32}/>
                <div className={cx("flex-full flex-retain-width", {"text-white": hover})}>
                    <h4 className="text-ellipsis text-nowrap overflow-hidden">{dashboard.name}</h4>
                    <div className="text-small text-capitalize">
                        {dashboard.created_at}
                    </div>

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
            <ol className="Grid Grid--guttersXl Grid--1of3">
                { dashboards.map(dash => <DashboardListItem dashboard={dash}/>)}
            </ol>
        );
    }
}