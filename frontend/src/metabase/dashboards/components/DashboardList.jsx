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
const DashboardListItem = enhance(({dashboard, setFavorited, setArchived, hover, setHover}: DashboardListItemType) => {
    return (<li className="Grid-cell shrink-below-content-size" style={{maxWidth: "550px"}}>
        <Link to={Urls.dashboard(dashboard.id)}
              data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + dashboard.id}
              className={cx(
                  "flex align-center border-box p2 rounded no-decoration transition-background bg-white transition-all"
              )}
              style={{
                  border: "1px solid rgba(220,225,228,0.50)",
                  boxShadow: hover ? "0 3px 8px 0 rgba(220,220,220,0.50)" : "0 1px 3px 0 rgba(220,220,220,0.50)",
                  height: "70px"
              }}
              onMouseOver={() => setHover(true)}
              onMouseLeave={() => setHover(false)}>
            <div className={cx("flex-full shrink-below-content-size")}>
                <div className="flex align-center">
                    <div className={cx("flex-full shrink-below-content-size")}>
                        <h3
                            className={cx(
                                "text-ellipsis text-nowrap overflow-hidden text-bold transition-all",
                                {"text-slate": !hover},
                                {"text-brand": hover}
                            )}
                            style={{marginBottom: "0.3em"}}
                        >
                            <Ellipsified>{dashboard.name}</Ellipsified>
                        </h3>
                        <div
                            className={cx("text-smaller text-uppercase text-bold text-grey-3")}>
                            {/* NOTE: Could these time formats be centrally stored somewhere? */}
                            {moment(dashboard.created_at).format('MMM D, YYYY')}
                        </div>
                    </div>
                    <div className="flex align-center">
                        { (dashboard.archived || hover) &&
                        <Tooltip tooltip={dashboard.archived ? "Unarchive" : "Archive"}>
                            <Icon
                                className="flex cursor-pointer text-light-blue text-brand-hover ml2"
                                name={dashboard.archived ? "unarchive" : "archive"}
                                size={21}
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
                                    "flex cursor-pointer ml2",
                                    {"text-light-blue text-brand-hover": !dashboard.favorite},
                                    {"text-gold": dashboard.favorite}
                                )}
                                name={dashboard.favorite ? "star" : "staroutline"}
                                size={22}
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

            { !hover && !dashboard.favorite &&
            <Icon name="dashboard"
                  className={cx("ml2", {"text-grey-1": !hover}, {"text-brand-darken": hover})} size={25}/>
            }
        </Link>
    </li>)
});

export default class DashboardList extends Component {
    static propTypes = {
        dashboards: PropTypes.array.isRequired
    };

    render() {
        const {dashboards, isArchivePage, setFavorited, setArchived} = this.props;

        return (
            <ol className="Grid Grid--guttersXl Grid--full small-Grid--1of2 md-Grid--1of3">
                { dashboards.map(dash =>
                    <DashboardListItem key={dash.id} dashboard={dash}
                                       setFavorited={setFavorited}
                                       setArchived={setArchived}
                                       disableLink={isArchivePage}/>
                )}
            </ol>
        );
    }
}
