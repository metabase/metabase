import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.react";
import MetabaseSettings from "metabase/lib/settings";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";

import { MODAL_EDIT_DETAILS,
         MODAL_INVITE_RESENT,
         MODAL_REMOVE_USER,
         MODAL_RESET_PASSWORD } from "./AdminPeople.react";
import { resendInvite, showModal } from "../actions";


export default class UserActionsSelect extends Component {

    onEditDetails() {
        this.props.dispatch(showModal({type: MODAL_EDIT_DETAILS, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onResendInvite() {
        this.props.dispatch(resendInvite(this.props.user));
        this.props.dispatch(showModal({type: MODAL_INVITE_RESENT, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onResetPassword() {
        this.props.dispatch(showModal({type: MODAL_RESET_PASSWORD, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    onRemoveUser() {
        this.props.dispatch(showModal({type: MODAL_REMOVE_USER, details: {user: this.props.user}}));
        this.refs.popover.toggle();
    }

    render() {
        let { user } = this.props;

        const tetherOptions = {
            attachment: 'top right',
            targetAttachment: 'bottom right',
            targetOffset: '5px 0',
            constraints: [{ to: 'window', attachment: 'together', pin: ['top', 'bottom']}]
        };

        return (
            <PopoverWithTrigger ref="popover"
                                className="block"
                                tetherOptions={tetherOptions}
                                triggerElement={<span className="text-grey-1"><Icon name={'ellipsis'}></Icon></span>}>
                <ul className="UserActionsSelect">
                    <li className="py1 px2 bg-brand-hover text-white-hover cursor-pointer" onClick={this.onEditDetails.bind(this)}>Edit Details</li>

                    { (user.last_login === null && MetabaseSettings.isEmailConfigured()) ?
                        <li className="py1 px2 bg-brand-hover text-white-hover cursor-pointer" onClick={this.onResendInvite.bind(this)}>Re-send Invite</li>
                    :
                        <li className="py1 px2 bg-brand-hover text-white-hover cursor-pointer" onClick={this.onResetPassword.bind(this)}>Reset Password</li>
                    }

                    <li className="mt1 p2 border-top bg-error-hover text-error text-white-hover cursor-pointer"  onClick={this.onRemoveUser.bind(this)}>Remove</li>
                </ul>
            </PopoverWithTrigger>
        );
    }
}

UserActionsSelect.propTypes = {
    user: React.PropTypes.object.isRequired
};
