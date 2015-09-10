'use strict';

import React, { Component, PropTypes } from 'react';
import OnClickOut from 'react-onclickout';
import cx from 'classnames';

import UserAvatar from './UserAvatar.react';
import Icon from './Icon.react';

export default class ProfileLink extends Component {
    constructor() {
        super()
        this.state = { dropdownOpen: false };
        this.toggleDropdown = this.toggleDropdown.bind(this);
        this.closeDropdown = this.closeDropdown.bind(this);
    }

    toggleDropdown() {
        this.setState({ dropdownOpen: !this.state.dropdownOpen });
    }

    closeDropdown() {
        this.setState({ dropdownOpen: false });
    }

    render() {
        const { user, context } = this.props;
        let dropDownClasses = cx({
            'NavDropdown': true,
            'inline-block': true,
            'cursor-pointer': true,
            'open': this.state.dropdownOpen,
        })


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

                    { this.state.dropdownOpen ?
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
                                :
                                    <li>
                                        <a onClick={this.closeDropdown} className="Dropdown-item block text-white no-decoration" href="/">
                                            Exit Admin
                                        </a>
                                    </li>
                                }
                                <li className="border-top border-light">
                                    <a className="Dropdown-item block text-white no-decoration" href="/auth/logout">Logout</a>
                                </li>
                            </ul>
                        </div>
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
