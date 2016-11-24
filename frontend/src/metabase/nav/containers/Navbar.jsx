import React, { Component, PropTypes } from 'react';
import cx from "classnames";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";

import DashboardsDropdown from "metabase/nav/containers/DashboardsDropdown.jsx";
import ProfileLink from "metabase/nav/components/ProfileLink.jsx";

import { getPath, getContext, getUser } from "../selectors";

const mapStateToProps = (state, props) => ({
    path:       getPath(state, props),
    context:    getContext(state, props),
    user:       getUser(state)
});

const mapDispatchToProps = {
    onChangeLocation: push
};

const AdminNavItem = ({ name, path, currentPath }) =>
    <li>
        <Link
            to={path}
            data-metabase-event={"Navbar;" + name}
            className={cx("NavItem py1 px2 no-decoration", {"is--selected": currentPath.startsWith(path) })}
        >
            {name}
        </Link>
    </li>

@connect(mapStateToProps, mapDispatchToProps)
export default class Navbar extends Component {
    static propTypes = {
        className: PropTypes.string,
        context: PropTypes.string.isRequired,
        path: PropTypes.string.isRequired,
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
        return this.props.path.startsWith(path);
    }

    renderAdminNav() {
        return (
            <nav className={cx("Nav AdminNav", this.props.className)}>
                <div className="wrapper flex align-center">
                    <div className="NavTitle flex align-center">
                        <Icon name={'gear'} className="AdminGear" size={22}></Icon>
                        <span className="NavItem-text ml1 hide sm-show">Site Administration</span>
                    </div>

                    <ul className="sm-ml4 flex flex-full">
                        <AdminNavItem name="Settings"    path="/admin/settings"     currentPath={this.props.path} />
                        <AdminNavItem name="People"      path="/admin/people"       currentPath={this.props.path} />
                        <AdminNavItem name="Data Model"  path="/admin/datamodel"    currentPath={this.props.path} />
                        <AdminNavItem name="Databases"   path="/admin/databases"    currentPath={this.props.path} />
                        <AdminNavItem name="Permissions" path="/admin/permissions"  currentPath={this.props.path} />
                    </ul>

                    <ProfileLink {...this.props} />
                </div>
            </nav>
        );
    }

    renderEmptyNav() {
        return (
            <nav className={cx("Nav py2 sm-py1 xl-py3 relative", this.props.className)}>
                <ul className="wrapper flex align-center">
                    <li>
                        <Link to="/" data-metabase-event={"Navbar;Logo"} className="NavItem cursor-pointer flex align-center">
                            <LogoIcon className="text-brand my2"></LogoIcon>
                        </Link>
                    </li>
                </ul>
            </nav>
        );
    }

    renderMainNav() {
        return (
            <nav className={cx("Nav CheckBg CheckBg-offset relative bg-brand sm-py2 sm-py1 xl-py3", this.props.className)}>
                <ul className="pl4 pr1 flex align-center">
                    <li>
                        <Link to="/" data-metabase-event={"Navbar;Logo"} className="NavItem cursor-pointer text-white flex align-center my1 transition-background">
                            <LogoIcon className="text-white m1"></LogoIcon>
                        </Link>
                    </li>
                    <li className="pl3">
                        <DashboardsDropdown {...this.props}>
                            <a data-metabase-event={"Navbar;Dashboard Dropdown;Toggle"} style={this.styles.navButton} className={cx("NavDropdown-button NavItem text-white text-bold cursor-pointer px2 flex align-center transition-background", {"NavItem--selected": this.isActive("/dash/")})}>
                                <span className="NavDropdown-button-layer">
                                    Dashboards
                                    <Icon className="ml1" name={'chevrondown'} size={8}></Icon>
                                </span>
                            </a>
                        </DashboardsDropdown>
                    </li>
                    <li className="pl1">
                        <Link to="/questions" data-metabase-event={"Navbar;Questions"} style={this.styles.navButton} className={cx("NavItem cursor-pointer text-white text-bold no-decoration flex align-center px2 transition-background")} activeClassName="NavItem--selected">Questions</Link>
                    </li>
                    <li className="pl1">
                        <Link to="/pulse" data-metabase-event={"Navbar;Pulses"} style={this.styles.navButton} className={cx("NavItem cursor-pointer text-white text-bold no-decoration flex align-center px2 transition-background")} activeClassName="NavItem--selected">Pulses</Link>
                    </li>
                    <li className="pl1">
                        <Link to="/reference/guide" data-metabase-event={"Navbar;DataReference"} style={this.styles.navButton} className={cx("NavItem cursor-pointer text-white text-bold no-decoration flex align-center px2 transition-background")} activeClassName="NavItem--selected">Data Reference</Link>
                    </li>
                    <li className="pl3">
                        <Link to="/q" data-metabase-event={"Navbar;New Question"} style={this.styles.newQuestion} className="NavNewQuestion rounded inline-block bg-white text-brand text-bold cursor-pointer px2 no-decoration transition-all">New <span className="hide sm-show">Question</span></Link>
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
