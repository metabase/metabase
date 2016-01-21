import React, { Component, PropTypes } from 'react';
import OnClickOut from 'react-onclickout';
import cx from 'classnames';
import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import A from "metabase/components/A.jsx"
import Modal from "metabase/components/Modal.jsx";

import UserAvatar from './UserAvatar.jsx';
import Icon from './Icon.jsx';
import LogoIcon from './LogoIcon.jsx';


export default class ProfileLink extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = { dropdownOpen: false, aboutModalOpen: false };

        _.bindAll(this, "toggleDropdown", "closeDropdown", "openModal", "closeModal");
    }

    static propTypes = {
        user: PropTypes.object.isRequired,
        context: PropTypes.string.isRequired,
    };

    toggleDropdown() {
        this.setState({ dropdownOpen: !this.state.dropdownOpen });
    }

    closeDropdown() {
        this.setState({ dropdownOpen: false });
    }

    openModal() {
        this.setState({ dropdownOpen: false, aboutModalOpen: true });
    }

    closeModal() {
        this.setState({ aboutModalOpen: false });
    }

    render() {
        const { user, context } = this.props;
        const { aboutModalOpen, dropdownOpen } = this.state;
        const { tag, date } = MetabaseSettings.get('version');

        let dropDownClasses = cx({
            'NavDropdown': true,
            'inline-block': true,
            'cursor-pointer': true,
            'open': dropdownOpen,
        });

        return (
            <OnClickOut onClickOut={this.closeDropdown}>
                <div className={dropDownClasses}>
                    <A metabaseEvent={["Navbar", "Profile Dropdown"]} className="NavDropdown-button NavItem flex align-center p2 transition-background" functions={this.toggleDropdown}>
                        <div className="NavDropdown-button-layer">
                            <div className="flex align-center">
                                <UserAvatar user={user} style={{backgroundColor: 'transparent'}}/>
                                <Icon name="chevrondown" className="Dropdown-chevron ml1" width="8px" height="8px" />
                            </div>
                        </div>
                    </A>

                    { dropdownOpen ?
                        <div className="NavDropdown-content right">
                            <ul className="NavDropdown-content-layer">
                                <li>
                                    <A metabaseEvent={["Navbar", "Edit Profile"]} functions={this.closeDropdown} className="Dropdown-item block text-white no-decoration" href="/user/edit_current">
                                        Account Settings
                                    </A>
                                </li>

                                { user.is_superuser && context !== 'admin' ?
                                    <li>
                                        <A metabaseEvent={["Navbar", "Enter Admin"]} functions={this.closeDropdown} className="Dropdown-item block text-white no-decoration" href="/admin/">
                                            Admin Panel
                                        </A>
                                    </li>
                                : null }

                                { user.is_superuser && context === 'admin' ?
                                    <li>
                                        <A metabaseEvent={["Navbar", "Exit Admin"]} functions={this.closeDropdown} className="Dropdown-item block text-white no-decoration" href="/">
                                            Exit Admin
                                        </A>
                                    </li>
                                : null }

                                <li>
                                    <A metabaseEvent={["Navbar", "Help", tag]} className="Dropdown-item block text-white no-decoration" href={"http://www.metabase.com/docs/"+tag} target="_blank">
                                        Help
                                    </A>
                                </li>

                                <li>
                                    <A metabaseEvent={["Navbar", "About Metabase", tag]} functions={this.openModal} className="Dropdown-item block text-white no-decoration">
                                        About Metabase
                                    </A>
                                </li>

                                <li className="border-top border-light">
                                    <A metabaseEvent={["Navbar", "Logout"]} className="Dropdown-item block text-white no-decoration" href="/auth/logout">Logout</A>
                                </li>
                            </ul>
                        </div>
                    : null }

                    { aboutModalOpen ?
                        <Modal className="Modal Modal--small">
                            <div className="px4 pt4 pb2 text-centered relative">
                                <span className="absolute top right p4 text-normal text-grey-3 cursor-pointer" onClick={this.closeModal}>
                                    <Icon name={'close'} width={16} height={16} />
                                </span>
                                <div className="text-brand pb2">
                                    <LogoIcon width={48} height={48} />
                                </div>
                                <h2 style={{fontSize: "1.75em"}} className="text-dark">Thanks for using Metabase!</h2>
                                <p className="pt2">
                                    <h3 className="text-dark">You're on version {tag}</h3>
                                    <span className="text-grey-3 text-bold">built on {date}</span>
                                </p>
                            </div>
                            <div style={{borderWidth: "2px"}} className="p2 h5 text-centered text-grey-3 border-top">
                                <span className="block"><span className="text-bold">Metabase</span> is a Trademark of Metabase, Inc</span>
                                <span>and is built with care in San Francisco, CA</span>
                            </div>
                        </Modal>
                    : null }
                </div>
            </OnClickOut>
        );
    }
};
