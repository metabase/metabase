import React, { Component, PropTypes } from 'react';
import OnClickOut from 'react-onclickout';
import cx from 'classnames';
import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import Modal from "metabase/components/Modal.react";

import UserAvatar from './UserAvatar.react';
import Icon from './Icon.react';


export default class ProfileLink extends Component {

    constructor() {
        super();

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
        const version = MetabaseSettings.get('version').short;

        let dropDownClasses = cx({
            'NavDropdown': true,
            'inline-block': true,
            'cursor-pointer': true,
            'open': dropdownOpen,
        });

        return (
            <OnClickOut onClickOut={this.closeDropdown}>
                <div className={dropDownClasses}>
                    <a className="NavDropdown-button NavItem flex align-center p2" onClick={this.toggleDropdown}>
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
                                    <a className="Dropdown-item block text-white no-decoration" href="http://www.metabase.com/docs/" target="_blank">
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
                        <Modal>
                            <div className="p4 text-centered relative">
                                <span className="absolute top right p4 text-normal cursor-pointer" onClick={this.closeModal}>
                                    <Icon name={'close'} width={24} height={24} />
                                </span>
                                <div className="text-error pb2">
                                    <Icon name={'cards'} width={48} height={48} />
                                </div>
                                <h2 className="text-dark">Thanks for using Metabase!</h2>
                                <p className="pt2">
                                    <h3 className="text-dark">You're on version {version}</h3>
                                    <span className="text-grey-3">build #hash</span>
                                </p>
                                <p className="pt2">
                                    If you require the legalese ...
                                </p>
                            </div>
                            <div style={{borderWidth: "2px"}} className="p2 h5 text-centered text-grey-3 border-top">
                                <span className="block"><span className="text-bold">Metabase</span> is a registered Trademark of Metabase, Inc</span>
                                <span>and is built in San Francisco, CA</span>
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
