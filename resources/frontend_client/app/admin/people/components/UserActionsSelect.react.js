"use strict";

import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import MetabaseSettings from "metabase/lib/settings";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";

import { MODAL_EDIT_DETAILS, MODAL_RESET_PASSWORD } from "./AdminPeople.react";
import { deleteUser, resendInvite, showModal } from "../actions";


export default class UserActionsSelect extends Component {

    onEditDetails() {
        this.props.dispatch(showModal({type: MODAL_EDIT_DETAILS, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onResendInvite() {
        this.props.dispatch(resendInvite(this.props.user));
        this.refs.popover.toggle();
    }

    onResetPassword() {
        this.props.dispatch(showModal({type: MODAL_RESET_PASSWORD, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onRemoveUser() {
        this.props.dispatch(deleteUser(this.props.user));
        this.refs.popover.toggle();
    }

    render() {
        let { user } = this.props;

        var triggerElement = (
            <span className="text-grey-1"><Icon name={'ellipsis'}></Icon></span>
        );

        var tetherOptions = {
            attachment: 'top right',
            targetAttachment: 'bottom right',
            targetOffset: '5px 0',
            constraints: [{ to: 'window', attachment: 'together', pin: ['top', 'bottom']}]
        };

        return (
            <PopoverWithTrigger ref="popover"
                                className={"PopoverBody PopoverBody--withArrow block"}
                                tetherOptions={tetherOptions}
                                triggerElement={triggerElement}>
                <ul className="UserActionsSelect">
                    <li onClick={this.onEditDetails.bind(this)}>Edit Details</li>

                    { (user.last_login === null && MetabaseSettings.isEmailConfigured()) ?
                        <li onClick={this.onResendInvite.bind(this)}>Re-send Invite</li>
                    :
                        <li onClick={this.onResetPassword.bind(this)}>Reset Password</li>
                    }

                    <li className="Remove" onClick={this.onRemoveUser.bind(this)}>Remove</li>
                </ul>
            </PopoverWithTrigger>
        );
    }
}

UserActionsSelect.propTypes = {
    user: React.PropTypes.object.isRequired
};
