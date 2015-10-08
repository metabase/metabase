import React, { Component, PropTypes } from 'react';
import OnClickOut from 'react-onclickout';
import cx from 'classnames';
import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import Modal from "metabase/components/Modal.react";

import UserAvatar from './UserAvatar.react';
import Icon from './Icon.react';
import LogoIcon from './LogoIcon.react';


export default class ProfileLink extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = { dropdownOpen: false, aboutModalOpen: false };

        _.bindAll(this, "toggleDropdown", "closeDropdown", "openModal", "closeModal");
    }

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
                    <a className="NavDropdown-button NavItem flex align-center p2 transition-background" onClick={this.toggleDropdown}>
                        <div className="NavDropdown-button-layer">
                            <div className="flex align-center">
                                <UserAvatar user={user} style={{backgroundColor: 'transparent'}}/>
                                <Icon name="chevrondown" className="Dropdown-chevron ml1" width="8px" height="8px" />
                            </div>
                        </div>
                    </a>

                    { dropdownOpen ?
                        <div className="NavDropdown-content right">
                            <ul className="NavDropdown-content-layer">
                                <li>
                                    <a onClick={this.closeDropdown} className="Dropdown-item block text-white no-decoration" href="/user/edit_current">
                                        Account Settings
                                    </a>
                                </li>

                                { user.is_superuser && context !== 'admin' ?
                                    <li>
                                        <a onClick={this.closeDropdown} className="Dropdown-item block text-white no-decoration" href="/admin/">
                                            Admin Panel
                                        </a>
                                    </li>
                                : null }

                                { user.is_superuser && context === 'admin' ?
                                    <li>
                                        <a onClick={this.closeDropdown} className="Dropdown-item block text-white no-decoration" href="/">
                                            Exit Admin
                                        </a>
                                    </li>
                                : null }

                                <li>
                                    <a className="Dropdown-item block text-white no-decoration" href={"http://www.metabase.com/docs/"+tag} target="_blank">
                                        Help
                                    </a>
                                </li>

                                <li>
                                    <a onClick={this.openModal} className="Dropdown-item block text-white no-decoration">
                                        About Metabase
                                    </a>
                                </li>

                                <li className="border-top border-light">
                                    <a className="Dropdown-item block text-white no-decoration" href="/auth/logout">Logout</a>
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
                                <p className="pt2 text-grey-3 text-bold">
                                    If you require the legalese ...
                                </p>
                                <div className="pt1">
                                    <span className="inline-block half text-centered py1"><a className="link text-bold" href="">License Agreement</a></span>
                                    <span style={{borderWidth: "2px"}} className="inline-block half text-centered py1 border-left"><a className="link text-bold" href="">Terms of Service</a></span>
                                </div>
                            </div>
                            <div style={{borderWidth: "2px"}} className="p2 h5 text-centered text-grey-3 border-top">
                                <span className="block"><span className="text-bold">Metabase</span> is a registered Trademark of Metabase, Inc</span>
                                <span>and is built with care in San Francisco, CA</span>
                            </div>
                        </Modal>
                    : null }
                </div>
            </OnClickOut>
        );
    }
};

ProfileLink.propTypes = {
    user: PropTypes.object.isRequired,
    context: PropTypes.string.isRequired,
}
