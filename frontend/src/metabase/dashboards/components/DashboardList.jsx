/* @flow */

import React, {Component} from "react";
import PropTypes from "prop-types";
import {Link} from "react-router";
import {withState} from "recompose";
import cx from "classnames";
import moment from "moment";

import * as Urls from "metabase/lib/urls";

import type {Dashboard} from "metabase/meta/types/Dashboard";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified.jsx";

type DashboardListItemType = {
    dashboard: Dashboard,
    hover: boolean,
    setHover: (boolean) => void
}

const enhance = withState('hover', 'setHover', false)
const DashboardListItem = enhance(({dashboard, hover, setHover}: DashboardListItemType) =>
    <li className="Grid-cell flex-retain-width" style={{maxWidth: "550px"}}>
        <Link to={Urls.dashboard(dashboard.id)}
              data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + dashboard.id}
              className={cx(
                  "flex align-center border-box p2 rounded no-decoration transition-background",
                  {"bg-white": !hover},
                  {"bg-brand": hover}
              )}
              style={{
                  border: "1px solid rgba(220,225,228,0.50)",
                  boxShadow: "0 1px 3px 0 rgba(220,220,220,0.50)",
                  height: "80px"
              }}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}>
            <Icon name="dashboard"
                  className={cx("pr2", {"text-grey-1": !hover}, {"text-brand-darken": hover})} size={32}/>
            <div className={cx("flex-full flex-retain-width")}>
                <h4 className={cx("text-ellipsis text-nowrap overflow-hidden text-brand", {"text-white": hover})}
                    style={{marginBottom: "0.2em"}}>
                    <Ellipsified>{dashboard.name}</Ellipsified>
                </h4>
                <div
                    className={cx("text-smaller text-uppercase text-bold", {"text-grey-3": !hover}, {"text-grey-2": hover})}>
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
            <ol className="Grid Grid--guttersXl Grid--full small-Grid--1of2 md-Grid--1of3">
                { dashboards.map(dash => <DashboardListItem key={dash.id} dashboard={dash}/>)}
            </ol>
        );
    }
}