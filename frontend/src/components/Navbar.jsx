import React, { Component, PropTypes } from 'react';
import cx from "classnames";

import DashboardsDropdown from "metabase/components/DashboardsDropdown.jsx";
import Icon from "metabase/components/Icon.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import ProfileLink from "metabase/components/ProfileLink.jsx";

// TODO - this relies on props.location, which is angular's $location service

export default class Navbar extends Component {
    static propTypes = {
        context: PropTypes.string.isRequired,
        location: PropTypes.object.isRequired,
        user: PropTypes.object
    };

    constructor(props, context) {
        super(props, context);

        this.styles = {
            navButton: {
                paddingLeft: "1.0rem",
                paddingRight: "1.0rem",
                paddingTop: "0.75rem",
                paddingBottom: "0.75rem"
            },

            newQuestion: {
                paddingLeft: "1.0rem",
                paddingRight: "1.0rem",
                paddingTop: "0.75rem",
                paddingBottom: "0.75rem",
            }
        };
    }

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
                            <a className={cx(classes, {"is--selected": this.isActive("/admin/datamodel")})} href="/admin/datamodel/database">
                                Data Model
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
            <nav className="CheckBg CheckBg-offset relative bg-brand sm-py2 sm-py1 xl-py3">
                <ul className="pl4 pr1 flex align-center">
                    <li>
                        <a className="NavItem cursor-pointer text-white flex align-center my1 transition-background" href="/">
                            <LogoIcon className="text-white m1"></LogoIcon>
                        </a>
                    </li>
                    <li className="pl3">
                        <DashboardsDropdown {...this.props}>
                            <a style={this.styles.navButton} className={cx("NavDropdown-button NavItem text-white text-bold cursor-pointer px2 flex align-center transition-background", {"NavItem--selected": this.isActive("/dash/")})}>
                                <span className="NavDropdown-button-layer">
                                    Dashboards
                                    <Icon className="ml1" name={'chevrondown'} width={8} height={8}></Icon>
                                </span>
                            </a>
                        </DashboardsDropdown>
                    </li>
                    <li className="pl1">
                        <a style={this.styles.navButton} className={cx("NavItem cursor-pointer text-white text-bold no-decoration flex align-center px2 transition-background", {"NavItem--selected": this.props.location.path() === "/card/"})} href="/card/">Questions</a>
                    </li>
                    <li className="pl1">
                        <a style={this.styles.navButton} className={cx("NavItem cursor-pointer text-white text-bold no-decoration flex align-center px2 transition-background", {"NavItem--selected": this.props.location.path() === "/pulse/"})} href="/pulse/">Pulses</a>
                    </li>
                    <li className="pl3">
                        <a style={this.styles.newQuestion} className="NavNewQuestion rounded inline-block bg-white text-brand text-bold cursor-pointer px2 no-decoration transition-all" href="/q">New <span className="hide sm-show">Question</span></a>
                    </li>
                    <li className="flex-align-right transition-background">
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
            case "auth": return null;
            case "none": return this.renderEmptyNav();
            case "setup": return null;
            default: return this.renderMainNav();
        }
    }
}
