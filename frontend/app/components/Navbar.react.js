import React, { Component, PropTypes } from 'react';
import cx from "classnames";

import DashboardsDropdown from "metabase/components/DashboardsDropdown.react";
import Icon from "metabase/components/Icon.react";
import LogoIcon from "metabase/components/LogoIcon.react";
import ProfileLink from "metabase/components/ProfileLink.react";


// TODO - this relies on props.location, which is angular's $location service

export default class Navbar extends Component {

    isActive(path) {
        return this.props.location.path().indexOf(path) >= 0;
    }

    renderAdminNav() {
        const classes = "NavItem py1 px2 no-decoration";

        return (
            <nav className="AdminNav">
                <div className="wrapper flex align-center">
                    <div className="NavTitle flex align-center">
                        <Icon name={'gear'} className="AdminGear" width={22} height={22}></Icon>
                        <span className="NavItem-text ml1 hide sm-show">Site Administration</span>
                    </div>

                    <ul className="sm-ml4 flex flex-full">
                        <li>
                            <a className={cx(classes, {"is--selected": this.isActive("/admin/settings")})}  href="/admin/settings/">
                                Settings
                            </a>
                        </li>
                        <li>
                            <a className={cx(classes, {"is--selected": this.isActive("/admin/people")})} href="/admin/people/">
                                People
                            </a>
                        </li>
                        <li>
                            <a className={cx(classes, {"is--selected": this.isActive("/admin/metadata")})} href="/admin/metadata/">
                                Metadata
                            </a>
                        </li>
                        <li>
                            <a className={cx(classes, {"is--selected": this.isActive("/admin/databases")})} href="/admin/databases/">
                                Databases
                            </a>
                        </li>
                    </ul>

                    <ProfileLink {...this.props}></ProfileLink>
                </div>
            </nav>
        );
    }

    renderAuthNav() {
        return (
            <nav className="py2 sm-py1 xl-py3 relative"></nav>
        );
    }

    renderEmptyNav() {
        return (
            <nav className="py2 sm-py1 xl-py3 relative">
                <ul className="wrapper flex align-center">
                    <li>
                        <a className="NavItem cursor-pointer flex align-center" href="/">
                            <LogoIcon className="text-brand my2"></LogoIcon>
                        </a>
                    </li>
                </ul>
            </nav>
        );
    }

    renderMainNav() {
        return (
            <nav className="CheckBg CheckBg-offset sm-py2 sm-py1 xl-py3 relative bg-brand">
                <ul className="wrapper flex align-center">
                    <li>
                        <a className="NavItem cursor-pointer text-white flex align-center my1" href="/">
                            <LogoIcon className="text-white m1"></LogoIcon>
                        </a>
                    </li>
                    <li>
                        <DashboardsDropdown {...this.props}></DashboardsDropdown>
                    </li>
                    <li>
                        <a className="NavItem cursor-pointer text-white no-decoration flex align-center p2" href="/card/">Saved Questions</a>
                    </li>
                    <li className="ml2">
                        <a className="rounded shadowed inline-block bg-white text-brand cursor-pointer p2 no-decoration" href="/q">New <span className="hide sm-show">Question</span></a>
                    </li>
                    <li className="flex-align-right">
                        <div className="inline-block text-white"><ProfileLink {...this.props}></ProfileLink></div>
                    </li>
                </ul>
            </nav>
        );
    }

    render() {
        let { context, user } = this.props;

        if (!user) return null;

        switch (context) {
            case "admin": return this.renderAdminNav();
            case "auth": return this.renderAuthNav();
            case "none": return this.renderEmptyNav();
            case "setup": return null;
            default: return this.renderMainNav();
        }
    }
}

Navbar.propTypes = {
    context: PropTypes.string.isRequired,
    location: PropTypes.string.isRequired,
    user: PropTypes.object
};
