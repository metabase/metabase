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
import Tooltip from "metabase/components/Tooltip";

type DashboardListItemType = {
    dashboard: Dashboard,
    hover: boolean,
    setHover: (boolean) => void,
    setFavorited: (dashId: number, favorited: boolean) => void,
    setArchived: (dashId: number, archived: boolean) => void,
    disableLink: boolean
}

const enhance = withState('hover', 'setHover', false)
const DashboardListItem = enhance(({dashboard, setFavorited, setArchived, hover, setHover, disableLink}: DashboardListItemType) => {
    const WrapperType = disableLink ? 'div' : Link

    return (<li className="Grid-cell shrink-below-content-size" style={{maxWidth: "550px"}}>
        <WrapperType to={Urls.dashboard(dashboard.id)}
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
              onMouseEnter={() => !disableLink && setHover(true)}
              onMouseLeave={() => setHover(false)}>
            <Icon name="dashboard"
                  className={cx("pr2", {"text-grey-1": !hover}, {"text-brand-darken": hover})} size={32}/>
            <div className={cx("flex-full shrink-below-content-size")}>
                <div className="flex align-center">
                    <div className={cx("flex-full shrink-below-content-size")}>
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
                    <div className="flex align-center">
                        { (dashboard.archived || hover) &&
                        <Tooltip tooltip={dashboard.archived ? "Unarchive" : "Archive"}>
                            <Icon
                                className="flex cursor-pointer text-light-blue mr2"
                                name={dashboard.archived ? "unarchive" : "archive"}
                                size={19}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setArchived(dashboard.id, !dashboard.archived, true)
                                } }
                            />
                        </Tooltip>
                        }
                        { setFavorited && (dashboard.favorite || hover) &&
                        <Tooltip tooltip={dashboard.favorite ? "Unfavorite" : "Favorite"}>
                            <Icon
                                className={cx(
                                    "flex cursor-pointer",
                                    {"text-light-blue": !dashboard.favorite},
                                    {"text-gold": dashboard.favorite}
                                )}
                                name={dashboard.favorite ? "star" : "staroutline"}
                                size={20}
                                onClick={(e) => {
                                    e.preventDefault();
                                    setFavorited(dashboard.id, !dashboard.favorite)
                                } }
                            />
                        </Tooltip>
                        }
                    </div>
                </div>
            </div>
        </WrapperType>
    </li>)
});

export default class DashboardList extends Component {
    static propTypes = {
        dashboards: PropTypes.array.isRequired
    };

    render() {
        const {dashboards, disableLinks, setFavorited, setArchived} = this.props;

        return (
            <ol className="Grid Grid--guttersXl Grid--full small-Grid--1of2 md-Grid--1of3">
                { dashboards.map(dash =>
                    <DashboardListItem key={dash.id} dashboard={dash}
                                       setFavorited={setFavorited}
                                       setArchived={setArchived}
                                       disableLink={disableLinks}/>
                )}
            </ol>
        );
    }
}
