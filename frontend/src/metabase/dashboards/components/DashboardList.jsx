/* @flow */

import React, {Component} from "react";
import PropTypes from "prop-types";
import {Link} from "react-router";
import cx from "classnames";
import moment from "moment";

import * as Urls from "metabase/lib/urls";

import type {Dashboard} from "metabase/meta/types/Dashboard";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import Tooltip from "metabase/components/Tooltip";

type DashboardListItemProps = {
    dashboard: Dashboard,
    setFavorited: (dashId: number, favorited: boolean) => void,
    setArchived: (dashId: number, archived: boolean) => void
}

class DashboardListItem extends Component {
    props: DashboardListItemProps

    state = {
        hover: false,
        fadingOut: false
    }

    render() {
        const {dashboard, setFavorited, setArchived} = this.props
        const {hover, fadingOut} = this.state

        const {id, name, created_at, archived, favorite} = dashboard

        const archivalButton =
            <Tooltip tooltip={archived ? "Unarchive" : "Archive"}>
                <Icon
                    className="flex cursor-pointer text-light-blue text-brand-hover ml2 archival-button"
                    name={archived ? "unarchive" : "archive"}
                    size={21}
                    onClick={(e) => {
                        e.preventDefault();

                        // Let the 0.2s transition finish before the archival API call (`setArchived` action)
                        this.setState({fadingOut: true})
                        setTimeout(() => setArchived(id, !archived, true), 300);
                    } }
                />
            </Tooltip>

        const favoritingButton =
            <Tooltip tooltip={favorite ? "Unfavorite" : "Favorite"}>
                <Icon
                    className={cx(
                        "flex cursor-pointer ml2 favoriting-button",
                        {"text-light-blue text-brand-hover": !favorite},
                        {"text-gold": favorite}
                    )}
                    name={favorite ? "star" : "staroutline"}
                    size={22}
                    onClick={(e) => {
                        e.preventDefault();
                        setFavorited(id, !favorite)
                    } }
                />
            </Tooltip>

        const dashboardIcon =
            <Icon name="dashboard"
                  className={"ml2 text-grey-1"}
                  size={25}/>

        return (
            <li className="Grid-cell shrink-below-content-size" style={{maxWidth: "550px"}}>
                <Link to={Urls.dashboard(id)}
                      data-metabase-event={"Navbar;Dashboards;Open Dashboard;" + id}
                      className={"flex align-center border-box p2 rounded no-decoration transition-background bg-white transition-all relative"}
                      style={{
                          border: "1px solid rgba(220,225,228,0.50)",
                          boxShadow: hover ? "0 3px 8px 0 rgba(220,220,220,0.50)" : "0 1px 3px 0 rgba(220,220,220,0.50)",
                          height: "70px",
                          opacity: fadingOut ? 0 : 1,
                          top: fadingOut ? "10px" : 0
                      }}
                      onMouseOver={() => this.setState({hover: true})}
                      onMouseLeave={() => this.setState({hover: false})}>
                    <div className={"flex-full shrink-below-content-size"}>
                        <div className="flex align-center">
                            <div className={"flex-full shrink-below-content-size"}>
                                <h3
                                    className={cx(
                                        "text-ellipsis text-nowrap overflow-hidden text-bold transition-all",
                                        {"text-slate": !hover},
                                        {"text-brand": hover}
                                    )}
                                    style={{marginBottom: "0.3em"}}
                                >
                                    <Ellipsified>{name}</Ellipsified>
                                </h3>
                                <div
                                    className={"text-smaller text-uppercase text-bold text-grey-3"}>
                                    {/* NOTE: Could these time formats be centrally stored somewhere? */}
                                    {moment(created_at).format('MMM D, YYYY')}
                                </div>
                            </div>

                            {/* Hidden flexbox item which makes sure that long titles are ellipsified correctly */}
                            <div className="flex align-center hidden">
                                { hover && archivalButton }
                                { (favorite || hover) && favoritingButton }
                                { !hover && !favorite && dashboardIcon }
                            </div>

                            {/* Non-hover dashboard icon, only rendered if the dashboard isn't favorited */}
                            {!favorite &&
                            <div className="flex align-center absolute right transition-all"
                                 style={{right: "16px", opacity: hover ? 0 : 1}}>
                                { dashboardIcon }
                            </div>
                            }

                            {/* Favorite icon, only rendered if the dashboard is favorited */}
                            {/* Visible also in the hover state (under other button) because hiding leads to an ugly animation */}
                            {favorite &&
                            <div className="flex align-center absolute right transition-all"
                                 style={{right: "16px", opacity: 1}}>
                                { favoritingButton }
                            </div>
                            }

                            {/* Hover state buttons, both archival and favoriting */}
                            <div className="flex align-center absolute right transition-all"
                                 style={{right: "16px", opacity: hover ? 1 : 0}}>
                                { archivalButton }
                                { favoritingButton }
                            </div>

                        </div>
                    </div>

                </Link>
            </li>
        )
    }

}

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
